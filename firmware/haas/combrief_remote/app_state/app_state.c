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

void combrief_app_state_init(combrief_app_state_t *state)
{
    if (state == NULL) {
        return;
    }

    memset(state, 0, sizeof(*state));
    state->remote_state = COMBRIEF_REMOTE_DISCONNECTED;
    state->display_mode = COMBRIEF_DISPLAY_SUMMARY;
    state->battery_percent = 100;
    copy_bounded(state->app_version, sizeof(state->app_version), "0.1.0");
    copy_bounded(state->primary_status, sizeof(state->primary_status), "Disconnected");
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

void combrief_app_state_set_battery(combrief_app_state_t *state, uint8_t percent)
{
    if (state == NULL) {
        return;
    }

    state->battery_percent = percent > 100 ? 100 : percent;
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
    state->display_mode = COMBRIEF_DISPLAY_SUMMARY;
    state->remote_state = state->ble_connected ? COMBRIEF_REMOTE_IDLE : COMBRIEF_REMOTE_DISCONNECTED;
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

    bounded_count = option_count > 8 ? 8 : option_count;
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
    copy_bounded(state->primary_status, sizeof(state->primary_status), "Waiting for resolution");
}

void combrief_app_state_mark_resolved(combrief_app_state_t *state, const char *result)
{
    if (state == NULL) {
        return;
    }

    combrief_app_state_clear_request(state);
    copy_bounded(state->last_resolved_result, sizeof(state->last_resolved_result), result);
    copy_bounded(state->primary_status, sizeof(state->primary_status), "Resolved");
}
