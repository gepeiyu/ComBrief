#include "display.h"

#include <stdio.h>
#include <string.h>

#include "../app_state/app_state.h"

static const char *mode_name(combrief_display_mode_t mode)
{
    return mode == COMBRIEF_DISPLAY_FULL ? "Full" : "Summary";
}

static const char *resolved_label(const char *result)
{
    if (result == NULL || result[0] == '\0') {
        return NULL;
    }
    if (strcmp(result, "expired") == 0) {
        return "Expired";
    }
    if (strcmp(result, "handled_elsewhere") == 0) {
        return "Handled elsewhere";
    }
    return result;
}

void display_init(void)
{
    printf("ComBrief display init: Waiting BLE\n");
}

void display_render(void)
{
    const combrief_app_state_t *state = combrief_app_state_get();

    if (state == NULL || !state->ble_connected || state->remote_state == COMBRIEF_REMOTE_DISCONNECTED) {
        printf("OLED: Waiting BLE\n");
        return;
    }

    if (state->last_resolved_result[0] != '\0') {
        const char *label = resolved_label(state->last_resolved_result);
        if (label != NULL && label != state->last_resolved_result) {
            printf("OLED: %s\n", label);
        } else {
            printf("OLED: resolved result %s\n", state->last_resolved_result);
        }
        return;
    }

    if (state->remote_state == COMBRIEF_REMOTE_IDLE || state->decision_id[0] == '\0') {
        printf("OLED: Waiting host - %s battery=%u%%\n", state->primary_status, (unsigned int)state->battery_percent);
        return;
    }

    if (state->remote_state == COMBRIEF_REMOTE_WAITING_RESOLVED || state->waiting_resolved) {
        printf("OLED: Waiting host resolved result\n");
        return;
    }

    if (state->display_mode == COMBRIEF_DISPLAY_FULL) {
        size_t content_len = strlen(state->content);
        printf("OLED: Full page %u length=%u\n",
            (unsigned int)state->full_page,
            (unsigned int)content_len);
        return;
    }

    if (state->display_mode == COMBRIEF_DISPLAY_SUMMARY) {
        printf("OLED: Summary %s option %u/%u\n",
            state->brief,
            (unsigned int)(state->selected_option + 1),
            (unsigned int)state->option_count);
        return;
    }

    printf("OLED: %s view\n", mode_name(state->display_mode));
}

void display_tick(void)
{
    combrief_app_state_t *state;

    display_render();

    state = combrief_app_state_get_mutable();
    if (state != NULL && state->last_resolved_result[0] != '\0') {
        state->last_resolved_result[0] = '\0';
    }
}
