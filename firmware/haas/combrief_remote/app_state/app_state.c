#include "app_state.h"

#include <stdio.h>
#include <string.h>

static combrief_app_state_t g_app_state;

static bool copy_bounded(char *dest, size_t dest_len, const char *src)
{
    if (dest == NULL || dest_len == 0) {
        return false;
    }

    if (src == NULL) {
        dest[0] = '\0';
        return true;
    }

    (void)snprintf(dest, dest_len, "%s", src);
    return true;
}

static bool combrief_app_state_is_waiting_resolved(const combrief_app_state_t *state)
{
    return state != NULL && (state->waiting_resolved || state->remote_state == COMBRIEF_REMOTE_WAITING_RESOLVED);
}

static const char *display_status_label(const char *status)
{
    if (status == NULL || status[0] == '\0') {
        return "UNK";
    }
    if (strcmp(status, "idle") == 0 || strcmp(status, "ready") == 0 || strcmp(status, "Ready") == 0) {
        return "OK";
    }
    if (strcmp(status, "working") == 0 || strcmp(status, "Working") == 0) {
        return "WORK";
    }
    if (strcmp(status, "waiting_user") == 0 || strcmp(status, "waiting") == 0) {
        return "ASK";
    }
    if (strcmp(status, "offline") == 0) {
        return "OFF";
    }
    return status;
}

static bool app_status_is_active(const char *status)
{
    return status != NULL && (
        strcmp(status, "waiting_user") == 0 ||
        strcmp(status, "waiting") == 0 ||
        strcmp(status, "working") == 0);
}

static const char *dominant_app_status(const combrief_app_state_t *state)
{
    uint8_t i;

    if (state == NULL) {
        return "idle";
    }
    for (i = 0; i < state->app_slot_count && i < COMBRIEF_MAX_TRACKED_APPS; i++) {
        if (strcmp(state->app_slots[i].status, "waiting_user") == 0 || strcmp(state->app_slots[i].status, "waiting") == 0) {
            return "waiting_user";
        }
    }
    for (i = 0; i < state->app_slot_count && i < COMBRIEF_MAX_TRACKED_APPS; i++) {
        if (strcmp(state->app_slots[i].status, "working") == 0) {
            return "working";
        }
    }
    if (state->app_slot_count > 0) {
        return state->app_slots[0].status[0] != '\0' ? state->app_slots[0].status : "idle";
    }
    return "idle";
}

void combrief_app_state_init(combrief_app_state_t *state)
{
    if (state == NULL) {
        return;
    }

    memset(state, 0, sizeof(*state));
    state->remote_state = COMBRIEF_REMOTE_DISCONNECTED;
    state->display_mode = COMBRIEF_DISPLAY_SUMMARY;
    state->battery_known = false;
    state->battery_percent = 0;
    copy_bounded(state->app_version, sizeof(state->app_version), "0.1.0");
    copy_bounded(state->primary_status, sizeof(state->primary_status), "Disconnected");
    state->app_summary[0] = '\0';
    state->last_resolved_result[0] = '\0';
}

void app_state_init(void)
{
    combrief_app_state_init(&g_app_state);
}

void app_state_tick(void)
{
}

combrief_app_state_t *combrief_app_state_get_mutable(void)
{
    return &g_app_state;
}

const combrief_app_state_t *combrief_app_state_get(void)
{
    return &g_app_state;
}

void combrief_app_state_set_ble_connected(combrief_app_state_t *state, bool connected)
{
    if (state == NULL) {
        return;
    }

    state->ble_connected = connected;
    if (connected) {
        if (state->remote_state == COMBRIEF_REMOTE_DISCONNECTED && state->decision_id[0] != '\0') {
            combrief_app_state_clear_request(state);
        }
        if (state->decision_id[0] == '\0') {
            state->remote_state = COMBRIEF_REMOTE_IDLE;
        }
        state->display_mode = COMBRIEF_DISPLAY_SUMMARY;
        state->full_page = 0;
        state->waiting_resolved = false;
        state->app_summary[0] = '\0';
        copy_bounded(state->primary_status, sizeof(state->primary_status), "Ready");
    } else {
        combrief_app_state_clear_request(state);
    }
}

void combrief_app_state_set_primary_status(combrief_app_state_t *state, const char *status)
{
    if (state == NULL) {
        return;
    }

    copy_bounded(state->primary_status, sizeof(state->primary_status), status);
}

void combrief_app_state_set_app_summary(combrief_app_state_t *state, const char *summary)
{
    if (state == NULL) {
        return;
    }

    copy_bounded(state->app_summary, sizeof(state->app_summary), summary);
}

void combrief_app_state_rebuild_app_summary(combrief_app_state_t *state)
{
    uint8_t i;
    size_t used = 0;

    if (state == NULL) {
        return;
    }

    state->app_summary[0] = '\0';
    for (i = 0; i < state->app_slot_count && i < COMBRIEF_MAX_TRACKED_APPS; i++) {
        int written;
        const char *label = state->app_slots[i].label[0] != '\0' ? state->app_slots[i].label : "CB";
        const char *status = state->app_slots[i].status[0] != '\0' ? state->app_slots[i].status : "idle";

        used = strlen(state->app_summary);
        if (used >= sizeof(state->app_summary) - 1) {
            break;
        }
        written = snprintf(
            state->app_summary + used,
            sizeof(state->app_summary) - used,
            "%s%s [%s]",
            used == 0 ? "" : "\n",
            label,
            display_status_label(status));
        if (written <= 0 || (size_t)written >= sizeof(state->app_summary) - used) {
            break;
        }
    }
}

bool combrief_app_state_set_app_slot(combrief_app_state_t *state, uint8_t index, const char *label, const char *status)
{
    if (state == NULL || index >= COMBRIEF_MAX_TRACKED_APPS || label == NULL || label[0] == '\0' || status == NULL || status[0] == '\0') {
        return false;
    }

    copy_bounded(state->app_slots[index].label, sizeof(state->app_slots[index].label), label);
    copy_bounded(state->app_slots[index].status, sizeof(state->app_slots[index].status), status);
    if (state->app_slot_count <= index) {
        state->app_slot_count = (uint8_t)(index + 1);
    }
    combrief_app_state_rebuild_app_summary(state);
    copy_bounded(state->primary_status, sizeof(state->primary_status), dominant_app_status(state));
    return true;
}

void combrief_app_state_clear_app_slots(combrief_app_state_t *state)
{
    if (state == NULL) {
        return;
    }

    memset(state->app_slots, 0, sizeof(state->app_slots));
    state->app_slot_count = 0;
    state->app_summary[0] = '\0';
}

bool combrief_app_state_has_status(const combrief_app_state_t *state, const char *status)
{
    uint8_t i;

    if (state == NULL || status == NULL || status[0] == '\0') {
        return false;
    }
    for (i = 0; i < state->app_slot_count && i < COMBRIEF_MAX_TRACKED_APPS; i++) {
        if (strcmp(state->app_slots[i].status, status) == 0) {
            return true;
        }
    }
    return false;
}

void combrief_app_state_apply_fast_status(combrief_app_state_t *state, const char *label, const char *status)
{
    const char *safe_label = label != NULL && label[0] != '\0' ? label : "CB";
    const char *safe_status = status != NULL && status[0] != '\0' ? status : "idle";
    uint8_t i;
    bool updated = false;

    if (state == NULL) {
        return;
    }

    for (i = 0; i < state->app_slot_count && i < COMBRIEF_MAX_TRACKED_APPS; i++) {
        if (strcmp(state->app_slots[i].label, safe_label) == 0) {
            copy_bounded(state->app_slots[i].status, sizeof(state->app_slots[i].status), safe_status);
            updated = true;
            break;
        }
    }
    if (!updated) {
        if (state->app_slot_count < COMBRIEF_MAX_TRACKED_APPS) {
            (void)combrief_app_state_set_app_slot(state, state->app_slot_count, safe_label, safe_status);
        } else {
            copy_bounded(state->app_slots[COMBRIEF_MAX_TRACKED_APPS - 1].label, sizeof(state->app_slots[COMBRIEF_MAX_TRACKED_APPS - 1].label), safe_label);
            copy_bounded(state->app_slots[COMBRIEF_MAX_TRACKED_APPS - 1].status, sizeof(state->app_slots[COMBRIEF_MAX_TRACKED_APPS - 1].status), safe_status);
        }
    }

    state->remote_state = state->ble_connected ? COMBRIEF_REMOTE_IDLE : COMBRIEF_REMOTE_DISCONNECTED;
    state->decision_id[0] = '\0';
    state->option_count = 0;
    state->waiting_resolved = false;
    state->waiting_request_content = app_status_is_active(safe_status) && strcmp(safe_status, "waiting_user") == 0;
    state->display_mode = COMBRIEF_DISPLAY_SUMMARY;
    state->full_page = 0;
    combrief_app_state_rebuild_app_summary(state);
    copy_bounded(state->primary_status, sizeof(state->primary_status), safe_status);
}

void combrief_app_state_set_battery(combrief_app_state_t *state, uint8_t percent)
{
    if (state == NULL) {
        return;
    }

    state->battery_known = true;
    state->battery_percent = percent > 100 ? 100 : percent;
}

void combrief_app_state_set_battery_unknown(combrief_app_state_t *state)
{
    if (state == NULL) {
        return;
    }

    state->battery_known = false;
    state->battery_percent = 0;
}

void combrief_app_state_clear_request(combrief_app_state_t *state)
{
    if (state == NULL) {
        return;
    }

    state->decision_id[0] = '\0';
    state->brief[0] = '\0';
    state->content[0] = '\0';
    memset(state->options, 0, sizeof(state->options));
    state->option_count = 0;
    state->selected_option = 0;
    state->full_page = 0;
    state->waiting_resolved = false;
    state->waiting_request_content = false;
    state->display_mode = COMBRIEF_DISPLAY_SUMMARY;
    state->remote_state = state->ble_connected ? COMBRIEF_REMOTE_IDLE : COMBRIEF_REMOTE_DISCONNECTED;
    state->app_summary[0] = '\0';
    copy_bounded(state->primary_status, sizeof(state->primary_status), state->ble_connected ? "Ready" : "Disconnected");
}

bool combrief_app_state_set_request(
    combrief_app_state_t *state,
    const char *decision_id,
    const char *brief,
    const char *content,
    const combrief_option_t *options,
    uint8_t option_count)
{
    uint8_t i;
    uint8_t bounded_count;

    if (state == NULL || decision_id == NULL || decision_id[0] == '\0' || option_count == 0 || options == NULL) {
        return false;
    }

    combrief_app_state_clear_request(state);
    state->last_resolved_result[0] = '\0';
    copy_bounded(state->decision_id, sizeof(state->decision_id), decision_id);
    copy_bounded(state->brief, sizeof(state->brief), brief);
    copy_bounded(state->content, sizeof(state->content), content);

    bounded_count = option_count > 3 ? 3 : option_count;
    for (i = 0; i < bounded_count; i++) {
        if (options != NULL) {
            copy_bounded(state->options[i].id, sizeof(state->options[i].id), options[i].id);
            copy_bounded(state->options[i].label, sizeof(state->options[i].label), options[i].label);
        }
    }

    state->option_count = bounded_count;
    state->selected_option = 0;
    state->full_page = 0;
    state->waiting_resolved = false;
    state->waiting_request_content = false;
    state->display_mode = COMBRIEF_DISPLAY_SUMMARY;
    state->remote_state = COMBRIEF_REMOTE_REQUEST_ACTIVE;
    copy_bounded(
        state->primary_status,
        sizeof(state->primary_status),
        state->brief[0] != '\0' ? state->brief : "Decision requested");
    return true;
}

bool combrief_app_state_select_next(combrief_app_state_t *state)
{
    if (state == NULL || state->option_count == 0 || combrief_app_state_is_waiting_resolved(state)) {
        return false;
    }

    state->selected_option = (uint8_t)((state->selected_option + 1) % state->option_count);
    state->remote_state = COMBRIEF_REMOTE_DECISION_PENDING;
    return true;
}

bool combrief_app_state_select_prev(combrief_app_state_t *state)
{
    if (state == NULL || state->option_count == 0 || combrief_app_state_is_waiting_resolved(state)) {
        return false;
    }

    state->selected_option = state->selected_option == 0
        ? (uint8_t)(state->option_count - 1)
        : (uint8_t)(state->selected_option - 1);
    state->remote_state = COMBRIEF_REMOTE_DECISION_PENDING;
    return true;
}

void combrief_app_state_toggle_full(combrief_app_state_t *state)
{
    if (state == NULL || combrief_app_state_is_waiting_resolved(state)) {
        return;
    }

    if (state->display_mode == COMBRIEF_DISPLAY_FULL) {
        state->display_mode = COMBRIEF_DISPLAY_SUMMARY;
        state->full_page = 0;
    } else {
        state->display_mode = COMBRIEF_DISPLAY_FULL;
    }
}

void combrief_app_state_mark_decision_sent(combrief_app_state_t *state)
{
    if (state == NULL || state->decision_id[0] == '\0') {
        return;
    }

    state->waiting_resolved = true;
    state->remote_state = COMBRIEF_REMOTE_WAITING_RESOLVED;
    state->display_mode = COMBRIEF_DISPLAY_SUMMARY;
    state->full_page = 0;
    state->brief[0] = '\0';
    state->content[0] = '\0';
    memset(state->options, 0, sizeof(state->options));
    state->option_count = 0;
    state->selected_option = 0;
    copy_bounded(state->primary_status, sizeof(state->primary_status), "Waiting for resolution");
}

void combrief_app_state_mark_resolved(combrief_app_state_t *state, const char *result)
{
    if (state == NULL) {
        return;
    }

    combrief_app_state_clear_request(state);
    copy_bounded(state->last_resolved_result, sizeof(state->last_resolved_result), result);
}
