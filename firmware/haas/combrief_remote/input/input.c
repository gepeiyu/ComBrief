#include "input.h"

#include <stdio.h>
#include <string.h>

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
#define COMBRIEF_INPUT_DETAIL_VISIBLE_LINES 5
#define COMBRIEF_INPUT_DETAIL_VISIBLE_COLUMNS 16

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

static size_t input_utf8_char_len(const char *text)
{
    unsigned char ch;

    if (text == NULL || text[0] == '\0') {
        return 0;
    }

    ch = (unsigned char)text[0];
    if (ch < 0x80) {
        return 1;
    }
    if ((ch & 0xE0) == 0xC0) {
        return 2;
    }
    if ((ch & 0xF0) == 0xE0) {
        return 3;
    }
    if ((ch & 0xF8) == 0xF0) {
        return 4;
    }
    return 1;
}

static uint8_t input_utf8_display_width(const char *text)
{
    return text != NULL && ((unsigned char)text[0]) >= 0x80 ? 2 : 1;
}

static uint8_t count_wrapped_detail_lines(const char *content)
{
    const char *cursor;
    uint8_t lines = 0;

    if (content == NULL || content[0] == '\0') {
        return 0;
    }

    cursor = content;
    while (*cursor != '\0' && lines < 255) {
        uint8_t columns = 0;

        while (*cursor != '\0' && *cursor != '\n') {
            size_t char_len = input_utf8_char_len(cursor);
            uint8_t char_width = input_utf8_display_width(cursor);

            if (char_len == 0) {
                break;
            }
            if (columns > 0 && columns + char_width > COMBRIEF_INPUT_DETAIL_VISIBLE_COLUMNS) {
                break;
            }
            columns = (uint8_t)(columns + char_width);
            cursor += char_len;
        }

        lines++;
        if (*cursor == '\n') {
            cursor++;
        }
    }

    return lines;
}

static uint8_t max_detail_page(const combrief_app_state_t *state)
{
    uint8_t lines;

    if (state == NULL) {
        return 0;
    }
    lines = count_wrapped_detail_lines(state->content);
    if (lines <= COMBRIEF_INPUT_DETAIL_VISIBLE_LINES) {
        return 0;
    }
    return (uint8_t)(lines - COMBRIEF_INPUT_DETAIL_VISIBLE_LINES);
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
    uint8_t max_page;

    if (state == NULL || state->display_mode != COMBRIEF_DISPLAY_FULL || state->waiting_resolved) {
        return false;
    }

    max_page = max_detail_page(state);
    if (state->full_page >= max_page) {
        state->full_page = max_page;
        return false;
    }

    state->full_page++;
    return true;
}

static bool combrief_input_send_decision(combrief_app_state_t *state, combrief_input_send_json_fn send_json)
{
    char payload[COMBRIEF_INPUT_DECISION_BUFFER_LEN];
    combrief_input_send_json_fn sender = send_json != NULL ? send_json : combrief_ble_send_json;

    if (state == NULL) {
        printf("ComBrief input decision skipped: no state\n");
        return false;
    }
    if (!state->ble_connected) {
        printf("ComBrief input decision skipped: BLE disconnected\n");
        return false;
    }
    if (state->remote_state != COMBRIEF_REMOTE_REQUEST_ACTIVE &&
        state->remote_state != COMBRIEF_REMOTE_DECISION_PENDING) {
        printf("ComBrief input decision skipped: remote_state=%u\n", (unsigned int)state->remote_state);
        return false;
    }
    if (!combrief_protocol_build_decision(payload, sizeof(payload), state)) {
        printf("ComBrief input decision build failed option=%u count=%u\n",
            (unsigned int)state->selected_option,
            (unsigned int)state->option_count);
        return false;
    }
    if (!sender(payload)) {
        printf("ComBrief input decision send failed length=%u\n", (unsigned int)strlen(payload));
        return false;
    }
    combrief_app_state_mark_decision_sent(state);
    printf("ComBrief input decision sent option=%u length=%u\n",
        (unsigned int)state->selected_option,
        (unsigned int)strlen(payload));
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
