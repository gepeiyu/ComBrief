#include "display.h"

#include <stdio.h>
#include <string.h>

#include "../app_state/app_state.h"

#if defined(BOARD_HAASEDUK1)
#include "hal_oled.h"
#include "hzk16.h"
#define COMBRIEF_HAS_HAAS_OLED 1
#else
#define COMBRIEF_HAS_HAAS_OLED 0
#endif

#define COMBRIEF_OLED_LINE_LEN 64
#define COMBRIEF_OLED_VISIBLE_COLUMNS 16
#define COMBRIEF_OLED_LINE_STEP 13
#define COMBRIEF_OLED_LEFT_MARGIN 2

#if COMBRIEF_HAS_HAAS_OLED
static bool g_hzk_ready = false;
#endif

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

static void copy_line(char *dest, size_t dest_len, const char *text)
{
    if (dest == NULL || dest_len == 0) {
        return;
    }
    if (text == NULL || text[0] == '\0') {
        dest[0] = '\0';
        return;
    }
    (void)snprintf(dest, dest_len, "%s", text);
}

static void copy_content_line(char *dest, size_t dest_len, const char *content, uint8_t line_index)
{
    const char *start;
    const char *end;
    uint8_t current = 0;
    size_t len;

    if (dest == NULL || dest_len == 0) {
        return;
    }
    dest[0] = '\0';
    if (content == NULL || content[0] == '\0') {
        return;
    }

    start = content;
    while (current < line_index && *start != '\0') {
        if (*start == '\n') {
            current++;
        }
        start++;
    }
    if (current != line_index || *start == '\0') {
        return;
    }

    end = strchr(start, '\n');
    if (end == NULL) {
        end = start + strlen(start);
    }
    len = (size_t)(end - start);
    if (len >= dest_len) {
        len = dest_len - 1;
    }
    memcpy(dest, start, len);
    dest[len] = '\0';
}

static size_t utf8_char_len(const char *text)
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

static uint8_t utf8_display_width(const char *text)
{
    return text != NULL && ((unsigned char)text[0]) >= 0x80 ? 2 : 1;
}

static void copy_wrapped_content_line(char *dest, size_t dest_len, const char *content, uint8_t line_index)
{
    const char *cursor;
    uint8_t current = 0;

    if (dest == NULL || dest_len == 0) {
        return;
    }
    dest[0] = '\0';
    if (content == NULL || content[0] == '\0') {
        return;
    }

    cursor = content;
    while (*cursor != '\0') {
        const char *line_start = cursor;
        size_t line_bytes = 0;
        uint8_t columns = 0;

        while (*cursor != '\0' && *cursor != '\n') {
            size_t char_len = utf8_char_len(cursor);
            uint8_t char_width = utf8_display_width(cursor);

            if (char_len == 0) {
                break;
            }
            if (columns > 0 && columns + char_width > COMBRIEF_OLED_VISIBLE_COLUMNS) {
                break;
            }
            columns = (uint8_t)(columns + char_width);
            line_bytes += char_len;
            cursor += char_len;
        }

        if (current == line_index) {
            if (line_bytes >= dest_len) {
                line_bytes = dest_len - 1;
            }
            memcpy(dest, line_start, line_bytes);
            dest[line_bytes] = '\0';
            return;
        }
        current++;

        if (*cursor == '\n') {
            cursor++;
        }
    }
}

static void copy_log_line(char *dest, size_t dest_len, const char *text)
{
    size_t len;

    if (dest == NULL || dest_len == 0) {
        return;
    }
    dest[0] = '\0';
    if (text == NULL || text[0] == '\0') {
        return;
    }

    len = strlen(text);
    if (len > 16) {
        len = 16;
    }
    if (len >= dest_len) {
        len = dest_len - 1;
    }
    memcpy(dest, text, len);
    dest[len] = '\0';
}

static void option_line(char *dest, size_t dest_len, const combrief_app_state_t *state, uint8_t option_index)
{
    const char *prefix;
    const char *label;

    if (dest == NULL || dest_len == 0) {
        return;
    }
    dest[0] = '\0';
    if (state == NULL || option_index >= state->option_count) {
        return;
    }

    prefix = option_index == state->selected_option ? "> " : "";
    label = state->options[option_index].label[0] != '\0' ? state->options[option_index].label : state->options[option_index].id;
    (void)snprintf(dest, dest_len, "%s%s", prefix, label);
}

#if COMBRIEF_HAS_HAAS_OLED
static void render_hzk_line(uint8_t y, const char *text)
{
    if (text != NULL && text[0] != '\0' && g_hzk_ready) {
        (void)hzk16_draw_utf8_line(COMBRIEF_OLED_LEFT_MARGIN, y, text, 1);
    }
}

static void render_oled_lines5(const char *line1, const char *line2, const char *line3, const char *line4, const char *line5)
{
    OLED_Clear();
    render_hzk_line(0, line1);
    render_hzk_line(COMBRIEF_OLED_LINE_STEP, line2);
    render_hzk_line(COMBRIEF_OLED_LINE_STEP * 2, line3);
    render_hzk_line(COMBRIEF_OLED_LINE_STEP * 3, line4);
    render_hzk_line(COMBRIEF_OLED_LINE_STEP * 4, line5);
    OLED_Refresh_GRAM();
}

static void render_oled_lines(const char *line1, const char *line2, const char *line3, const char *line4)
{
    render_oled_lines5(line1, line2, line3, line4, "");
}
#else
static void render_oled_lines5(const char *line1, const char *line2, const char *line3, const char *line4, const char *line5)
{
    (void)line1;
    (void)line2;
    (void)line3;
    (void)line4;
    (void)line5;
}

static void render_oled_lines(const char *line1, const char *line2, const char *line3, const char *line4)
{
    render_oled_lines5(line1, line2, line3, line4, "");
}
#endif

static void render_waiting_ble(const combrief_app_state_t *state)
{
    char version[COMBRIEF_OLED_LINE_LEN];

    copy_line(version, sizeof(version), "VER: ");
    if (state != NULL && state->app_version[0] != '\0') {
        (void)snprintf(version, sizeof(version), "VER: %s", state->app_version);
    }

    render_oled_lines5("ComBrief", version, "等待连接", "", "");
    printf("OLED: Waiting BLE\n");
}

void display_init(void)
{
#if COMBRIEF_HAS_HAAS_OLED
    uint8_t init_result = sh1106_init();

    g_hzk_ready = (hzk16_init() == 0);
    printf("ComBrief display init sh1106=%u hzk=%u\n",
           (unsigned int)init_result,
           g_hzk_ready ? 1U : 0U);
#else
    printf("ComBrief display init: Waiting BLE\n");
#endif
    render_oled_lines5("ComBrief", "VER: 0.1.0", "启动中", "等待连接", "");
}

void display_render(void)
{
    const combrief_app_state_t *state = combrief_app_state_get();

    if (state == NULL || !state->ble_connected || state->remote_state == COMBRIEF_REMOTE_DISCONNECTED) {
        render_waiting_ble(state);
        return;
    }

    if (state->last_resolved_result[0] != '\0') {
        const char *label = resolved_label(state->last_resolved_result);
        if (label != NULL && label != state->last_resolved_result) {
            render_oled_lines("ComBrief", "Resolved", label, "");
            printf("OLED: %s\n", label);
        } else {
            render_oled_lines("ComBrief", "Resolved", state->last_resolved_result, "");
            printf("OLED: resolved result %s\n", state->last_resolved_result);
        }
        return;
    }

    if (state->remote_state == COMBRIEF_REMOTE_IDLE || state->decision_id[0] == '\0') {
        const char *status_line = state->app_summary[0] != '\0' ? state->app_summary : state->primary_status;
        if (state->app_summary[0] != '\0') {
            char app1[COMBRIEF_OLED_LINE_LEN];
            char app2[COMBRIEF_OLED_LINE_LEN];
            char battery[COMBRIEF_OLED_LINE_LEN];
            copy_content_line(app1, sizeof(app1), state->app_summary, 0);
            copy_content_line(app2, sizeof(app2), state->app_summary, 1);
            if (state->battery_known) {
                (void)snprintf(battery, sizeof(battery), "Battery %u%%", (unsigned int)state->battery_percent);
                render_oled_lines("ComBrief", app1, app2, battery);
                printf("OLED: Apps - %s\n%s | %s\n", app1, app2, battery);
            } else {
                render_oled_lines("ComBrief", app1, app2, "");
                printf("OLED: Apps - %s\n%s\n", app1, app2);
            }
            return;
        }
        if (state->battery_known) {
            char battery[COMBRIEF_OLED_LINE_LEN];
            (void)snprintf(battery, sizeof(battery), "Battery %u%%", (unsigned int)state->battery_percent);
            render_oled_lines("ComBrief", status_line, battery, "");
            printf("OLED: Apps - %s | %s\n", status_line, battery);
        } else {
            render_oled_lines("ComBrief", status_line, "", "");
            printf("OLED: Apps - %s\n", status_line);
        }
        return;
    }

    if (state->remote_state == COMBRIEF_REMOTE_WAITING_RESOLVED || state->waiting_resolved) {
        render_oled_lines("ComBrief", "Decision sent", "Waiting result", state->brief);
        printf("OLED: Waiting host resolved result\n");
        return;
    }

    if (state->display_mode == COMBRIEF_DISPLAY_FULL) {
        char line1[COMBRIEF_OLED_LINE_LEN];
        char line2[COMBRIEF_OLED_LINE_LEN];
        char line3[COMBRIEF_OLED_LINE_LEN];
        char line4[COMBRIEF_OLED_LINE_LEN];
        char line5[COMBRIEF_OLED_LINE_LEN];

        copy_wrapped_content_line(line1, sizeof(line1), state->content, state->full_page);
        copy_wrapped_content_line(line2, sizeof(line2), state->content, (uint8_t)(state->full_page + 1));
        copy_wrapped_content_line(line3, sizeof(line3), state->content, (uint8_t)(state->full_page + 2));
        copy_wrapped_content_line(line4, sizeof(line4), state->content, (uint8_t)(state->full_page + 3));
        copy_wrapped_content_line(line5, sizeof(line5), state->content, (uint8_t)(state->full_page + 4));
        render_oled_lines5(line1, line2, line3, line4, line5);
        {
            char log1[COMBRIEF_OLED_LINE_LEN];
            char log2[COMBRIEF_OLED_LINE_LEN];
            char log3[COMBRIEF_OLED_LINE_LEN];
            char log4[COMBRIEF_OLED_LINE_LEN];
            char log5[COMBRIEF_OLED_LINE_LEN];
            copy_log_line(log1, sizeof(log1), line1);
            copy_log_line(log2, sizeof(log2), line2);
            copy_log_line(log3, sizeof(log3), line3);
            copy_log_line(log4, sizeof(log4), line4);
            copy_log_line(log5, sizeof(log5), line5);
            printf("OLED: Detail %s | %s | %s | %s | %s\n", log1, log2, log3, log4, log5);
        }
        return;
    }

    if (state->display_mode == COMBRIEF_DISPLAY_SUMMARY) {
        char question1[COMBRIEF_OLED_LINE_LEN];
        char question2[COMBRIEF_OLED_LINE_LEN];
        char option1[COMBRIEF_OLED_LINE_LEN];
        char option2[COMBRIEF_OLED_LINE_LEN];
        char option3[COMBRIEF_OLED_LINE_LEN];

        copy_content_line(question1, sizeof(question1), state->brief, 0);
        copy_content_line(question2, sizeof(question2), state->brief, 1);
        if (question1[0] == '\0') {
            copy_line(question1, sizeof(question1), state->brief);
        }
        if (question2[0] == '\0') {
            copy_content_line(question2, sizeof(question2), state->content, 1);
        }
        option_line(option1, sizeof(option1), state, 0);
        option_line(option2, sizeof(option2), state, 1);
        option_line(option3, sizeof(option3), state, 2);
        render_oled_lines5(question1, question2, option1, option2, option3);
        printf("OLED: Summary %s | %s | %s | %s | %s\n", question1, question2, option1, option2, option3);
        return;
    }

    render_oled_lines("ComBrief", mode_name(state->display_mode), state->primary_status, "");
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
