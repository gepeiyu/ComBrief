#include "input.h"

#include <stdio.h>

#include "../ble_service/ble_service.h"
#include "../protocol/protocol.h"

#define COMBRIEF_INPUT_DECISION_BUFFER_LEN 512
#define COMBRIEF_INPUT_FULL_PAGE_COUNT 8

#if defined(__GNUC__) || defined(__clang__)
__attribute__((weak))
#endif
bool combrief_ble_send_json(const char *json)
{
    return json != NULL && json[0] != '\0';
}

static void combrief_input_return_summary(combrief_app_state_t *state)
{
    if (state == NULL) {
        return;
    }

    state->display_mode = COMBRIEF_DISPLAY_SUMMARY; /* return summary */
    state->full_page = 0;
}

static bool combrief_input_prev_page(combrief_app_state_t *state)
{
    if (state == NULL || state->display_mode != COMBRIEF_DISPLAY_FULL || state->waiting_resolved) {
        return false;
    }

    state->full_page = state->full_page == 0 ? (uint8_t)(COMBRIEF_INPUT_FULL_PAGE_COUNT - 1) : (uint8_t)(state->full_page - 1);
    return true;
}

static bool combrief_input_next_page(combrief_app_state_t *state)
{
    if (state == NULL || state->display_mode != COMBRIEF_DISPLAY_FULL || state->waiting_resolved) {
        return false;
    }

    state->full_page = (uint8_t)((state->full_page + 1) % COMBRIEF_INPUT_FULL_PAGE_COUNT);
    return true;
}

void input_init(void)
{
    printf("ComBrief input init K1/K2/K3/K4\n");
}

void input_tick(void)
{
}

bool combrief_input_handle_key(combrief_app_state_t *state, combrief_key_t key, combrief_input_send_json_fn send_json)
{
    if (state == NULL || key == COMBRIEF_KEY_NONE) {
        return false;
    }
    if (state->waiting_resolved || state->remote_state == COMBRIEF_REMOTE_WAITING_RESOLVED) {
        return false;
    }

    if (state->display_mode == COMBRIEF_DISPLAY_FULL) {
        switch (key) {
        case COMBRIEF_KEY_K2:
            return combrief_input_prev_page(state);
        case COMBRIEF_KEY_K4:
            return combrief_input_next_page(state);
        case COMBRIEF_KEY_K1:
        case COMBRIEF_KEY_K3:
            combrief_input_return_summary(state);
            return true;
        case COMBRIEF_KEY_NONE:
        default:
            return false;
        }
    }

    if (state->display_mode == COMBRIEF_DISPLAY_SUMMARY) {
        switch (key) {
        case COMBRIEF_KEY_K1: {
            char payload[COMBRIEF_INPUT_DECISION_BUFFER_LEN];
            combrief_input_send_json_fn sender = send_json != NULL ? send_json : combrief_ble_send_json;

            if (!state->ble_connected ||
                (state->remote_state != COMBRIEF_REMOTE_REQUEST_ACTIVE &&
                 state->remote_state != COMBRIEF_REMOTE_DECISION_PENDING)) {
                return false;
            }
            if (!combrief_protocol_build_decision(payload, sizeof(payload), state)) {
                return false;
            }
            if (!sender(payload)) {
                return false;
            }
            combrief_app_state_mark_decision_sent(state);
            return true;
        }
        case COMBRIEF_KEY_K2:
            return combrief_app_state_select_prev(state);
        case COMBRIEF_KEY_K3:
            combrief_app_state_toggle_full(state);
            return state->display_mode == COMBRIEF_DISPLAY_FULL;
        case COMBRIEF_KEY_K4:
            return combrief_app_state_select_next(state);
        case COMBRIEF_KEY_NONE:
        default:
            return false;
        }
    }

    return false;
}
