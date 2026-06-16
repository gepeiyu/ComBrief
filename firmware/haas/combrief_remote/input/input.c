#include "input.h"

#include <stdio.h>

#include "../ble_service/ble_service.h"
#include "../protocol/protocol.h"

#if defined(BOARD_HAASEDUK1)
#include "key.h"
#define COMBRIEF_HAS_HAAS_KEY 1
#else
#define COMBRIEF_HAS_HAAS_KEY 0
typedef enum {
    EDK_KEY_1 = 0b0001,
    EDK_KEY_2 = 0b0010,
    EDK_KEY_3 = 0b0100,
    EDK_KEY_4 = 0b1000,
} edk_keycode_t;
typedef uint8_t key_code_t;
typedef void (*key_code_cb)(key_code_t key_code);
#endif

#define COMBRIEF_INPUT_DECISION_BUFFER_LEN 512
#define COMBRIEF_INPUT_MAX_DETAIL_SCROLL 16

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

static bool combrief_input_prev_detail_line(combrief_app_state_t *state)
{
    if (state == NULL || state->display_mode != COMBRIEF_DISPLAY_FULL || state->waiting_resolved) {
        return false;
    }
    if (state->full_page == 0) {
        return false;
    }

    state->full_page--;
    return true;
}

static bool combrief_input_next_detail_line(combrief_app_state_t *state)
{
    if (state == NULL || state->display_mode != COMBRIEF_DISPLAY_FULL || state->waiting_resolved) {
        return false;
    }
    if (state->full_page >= COMBRIEF_INPUT_MAX_DETAIL_SCROLL) {
        return false;
    }

    state->full_page++;
    return true;
}

static bool combrief_input_send_decision(combrief_app_state_t *state, combrief_input_send_json_fn send_json)
{
    char payload[COMBRIEF_INPUT_DECISION_BUFFER_LEN];
    combrief_input_send_json_fn sender = send_json != NULL ? send_json : combrief_ble_send_json;

    if (state == NULL ||
        !state->ble_connected ||
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

static combrief_key_t map_board_key(key_code_t key_code)
{
    if ((key_code & EDK_KEY_1) != 0) {
        return COMBRIEF_KEY_K1;
    }
    if ((key_code & EDK_KEY_2) != 0) {
        return COMBRIEF_KEY_K2;
    }
    if ((key_code & EDK_KEY_3) != 0) {
        return COMBRIEF_KEY_K3;
    }
    if ((key_code & EDK_KEY_4) != 0) {
        return COMBRIEF_KEY_K4;
    }
    return COMBRIEF_KEY_NONE;
}

static void handle_board_key(key_code_t key_code)
{
    combrief_key_t key = map_board_key(key_code);
    bool handled = combrief_input_handle_key(combrief_app_state_get_mutable(), key, combrief_ble_send_json);

    if (key != COMBRIEF_KEY_NONE) {
        printf("ComBrief input key=%u handled=%u\n", (unsigned int)key, handled ? 1U : 0U);
    }
}

void input_init(void)
{
#if COMBRIEF_HAS_HAAS_KEY
    int ret = key_init(handle_board_key);
    printf("ComBrief input init K1/K2/K3/K4 key_init=%d\n", ret);
#else
    printf("ComBrief input init K1/K2/K3/K4\n");
#endif
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
            return combrief_input_prev_detail_line(state);
        case COMBRIEF_KEY_K4:
            return combrief_input_next_detail_line(state);
        case COMBRIEF_KEY_K1:
            return combrief_input_send_decision(state, send_json);
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
        case COMBRIEF_KEY_K1:
            return combrief_input_send_decision(state, send_json);
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
