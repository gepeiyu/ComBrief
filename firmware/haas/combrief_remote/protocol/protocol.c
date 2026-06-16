#include "protocol.h"

#include <ctype.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

static bool write_payload(char *out, size_t out_len, const char *format, ...)
{
    int written;
    va_list args;

    if (out == NULL || out_len == 0 || format == NULL) {
        return false;
    }

    va_start(args, format);
    written = vsnprintf(out, out_len, format, args);
    va_end(args);

    return written >= 0 && (size_t)written < out_len;
}

void protocol_init(void)
{
}

void protocol_tick(void)
{
}

static bool json_escape(char *out, size_t out_len, const char *value)
{
    size_t i = 0;
    size_t j = 0;

    if (out == NULL || out_len == 0) {
        return false;
    }

    if (value == NULL) {
        out[0] = '\0';
        return true;
    }

    while (value[i] != '\0' && j + 1 < out_len) {
        unsigned char ch = (unsigned char)value[i++];

        if (ch == '"' || ch == '\\') {
            if (j + 2 >= out_len) {
                return false;
            }
            out[j++] = '\\';
            out[j++] = (char)ch;
            continue;
        }
        if (ch == '\n' || ch == '\r' || ch == '\t') {
            char escaped = ch == '\n' ? 'n' : (ch == '\r' ? 'r' : 't');
            if (j + 2 >= out_len) {
                return false;
            }
            out[j++] = '\\';
            out[j++] = escaped;
            continue;
        }
        if (ch < 0x20) {
            if (j + 7 >= out_len) {
                return false;
            }
            j += (size_t)snprintf(&out[j], out_len - j, "\\u%04x", (unsigned int)ch);
            continue;
        }

        out[j++] = (char)ch;
    }

    out[j] = '\0';
    return value[i] == '\0';
}

bool combrief_protocol_build_hello(char *out, size_t out_len, const combrief_app_state_t *state)
{
    if (state != NULL && state->battery_known) {
        return write_payload(
            out,
            out_len,
            "{\"protocol\":1,\"type\":\"hello\",\"deviceName\":\"%s\",\"platform\":\"%s\",\"fwVersion\":\"%s\",\"battery\":%u,\"capabilities\":{\"briefFullToggle\":true,\"maxOptions\":%d,\"maxBriefLen\":%d,\"maxContentLen\":%d}}",
            COMBRIEF_REMOTE_NAME,
            COMBRIEF_REMOTE_PLATFORM,
            COMBRIEF_REMOTE_FW_VERSION,
            (unsigned int)state->battery_percent,
            COMBRIEF_MAX_OPTIONS,
            COMBRIEF_MAX_BRIEF_LEN,
            COMBRIEF_MAX_CONTENT_LEN);
    }

    return write_payload(
        out,
        out_len,
        "{\"protocol\":1,\"type\":\"hello\",\"deviceName\":\"%s\",\"platform\":\"%s\",\"fwVersion\":\"%s\",\"capabilities\":{\"briefFullToggle\":true,\"maxOptions\":%d,\"maxBriefLen\":%d,\"maxContentLen\":%d}}",
        COMBRIEF_REMOTE_NAME,
        COMBRIEF_REMOTE_PLATFORM,
        COMBRIEF_REMOTE_FW_VERSION,
        COMBRIEF_MAX_OPTIONS,
        COMBRIEF_MAX_BRIEF_LEN,
        COMBRIEF_MAX_CONTENT_LEN);
}

bool combrief_protocol_build_decision(char *out, size_t out_len, const combrief_app_state_t *state)
{
    char decision_id[96];
    char option_id[64];
    const combrief_option_t *option;

    if (state == NULL ||
        state->waiting_resolved ||
        state->remote_state == COMBRIEF_REMOTE_WAITING_RESOLVED ||
        state->decision_id[0] == '\0' ||
        state->option_count == 0 ||
        state->selected_option >= state->option_count) {
        return false;
    }

    option = &state->options[state->selected_option];
    if (option->id[0] == '\0' ||
        !json_escape(decision_id, sizeof(decision_id), state->decision_id) ||
        !json_escape(option_id, sizeof(option_id), option->id)) {
        return false;
    }

    return write_payload(
        out,
        out_len,
        "{\"protocol\":1,\"type\":\"decision\",\"decisionId\":\"%s\",\"optionId\":\"%s\",\"ts\":%u}",
        decision_id,
        option_id,
        (unsigned int)time(NULL));
}

bool combrief_protocol_build_battery(char *out, size_t out_len, const combrief_app_state_t *state)
{
    if (state == NULL || !state->battery_known) {
        return false;
    }

    return write_payload(
        out,
        out_len,
        "{\"protocol\":1,\"type\":\"battery\",\"battery\":%u}",
        (unsigned int)state->battery_percent);
}

static bool is_json_object(const char *json)
{
    const char *cursor;
    int object_depth = 0;
    int array_depth = 0;
    bool in_string = false;
    bool escaped = false;

    if (json == NULL) {
        return false;
    }

    cursor = json;
    while (*cursor != '\0' && isspace((unsigned char)*cursor)) {
        cursor++;
    }
    if (*cursor != '{') {
        return false;
    }

    while (*cursor != '\0') {
        char ch = *cursor;

        if (escaped) {
            escaped = false;
        } else if (ch == '\\' && in_string) {
            escaped = true;
        } else if (ch == '"') {
            in_string = !in_string;
        } else if (!in_string && ch == '{') {
            object_depth++;
        } else if (!in_string && ch == '}') {
            object_depth--;
            if (object_depth < 0) {
                return false;
            }
            if (object_depth == 0) {
                cursor++;
                break;
            }
        } else if (!in_string && ch == '[') {
            array_depth++;
        } else if (!in_string && ch == ']') {
            array_depth--;
            if (array_depth < 0) {
                return false;
            }
        }
        cursor++;
    }

    if (object_depth != 0 || array_depth != 0 || in_string || escaped) {
        return false;
    }
    while (*cursor != '\0' && isspace((unsigned char)*cursor)) {
        cursor++;
    }

    return *cursor == '\0';
}

static const char *find_top_level_key(const char *json, const char *key)
{
    const char *cursor = json;
    int object_depth = 0;
    int array_depth = 0;
    bool in_string = false;
    bool escaped = false;

    if (json == NULL || key == NULL) {
        return NULL;
    }

    while (*cursor != '\0') {
        char ch = *cursor;

        if (escaped) {
            escaped = false;
        } else if (ch == '\\' && in_string) {
            escaped = true;
        } else if (ch == '"') {
            if (!in_string && object_depth == 1 && array_depth == 0 && strncmp(cursor, key, strlen(key)) == 0) {
                return cursor + strlen(key);
            }
            in_string = !in_string;
        } else if (!in_string && ch == '{') {
            object_depth++;
        } else if (!in_string && ch == '}') {
            object_depth--;
            if (object_depth == 0) {
                return NULL;
            }
        } else if (!in_string && ch == '[') {
            array_depth++;
        } else if (!in_string && ch == ']') {
            array_depth--;
        }
        cursor++;
    }

    return NULL;
}

static const char *value_after_key(const char *json, const char *key)
{
    const char *cursor = find_top_level_key(json, key);

    if (cursor == NULL) {
        return NULL;
    }

    while (*cursor != '\0' && isspace((unsigned char)*cursor)) {
        cursor++;
    }
    if (*cursor != ':') {
        return NULL;
    }
    cursor++;
    while (*cursor != '\0' && isspace((unsigned char)*cursor)) {
        cursor++;
    }

    return cursor;
}

static bool has_protocol_version(const char *json)
{
    const char *cursor = value_after_key(json, "\"protocol\"");

    if (cursor == NULL || cursor[0] != '1') {
        return false;
    }
    cursor++;
    while (*cursor != '\0' && isspace((unsigned char)*cursor)) {
        cursor++;
    }

    return *cursor == ',' || *cursor == '}';
}

static bool top_level_string_equals(const char *json, const char *key, const char *expected)
{
    const char *cursor = value_after_key(json, key);
    size_t expected_len;

    if (cursor == NULL || *cursor != '"') {
        return false;
    }
    cursor++;
    expected_len = strlen(expected);

    return strncmp(cursor, expected, expected_len) == 0 && cursor[expected_len] == '"';
}

static bool has_message_type(const char *json, const char *type)
{
    return top_level_string_equals(json, "\"type\"", type);
}

static bool extract_top_level_string(const char *json, const char *key, char *out, size_t out_len)
{
    const char *cursor;
    size_t i = 0;

    if (out == NULL || out_len == 0) {
        return false;
    }
    out[0] = '\0';

    cursor = value_after_key(json, key);
    if (cursor == NULL || *cursor != '"') {
        return false;
    }
    cursor++;

    while (*cursor != '\0' && *cursor != '"') {
        char ch = *cursor;
        if (*cursor == '\\' && cursor[1] != '\0') {
            cursor++;
            ch = *cursor == 'n' ? '\n' : (*cursor == 'r' ? '\r' : (*cursor == 't' ? '\t' : *cursor));
        }
        if (i + 1 < out_len) {
            out[i++] = ch;
        }
        cursor++;
    }

    if (*cursor != '"') {
        out[0] = '\0';
        return false;
    }

    out[i] = '\0';
    return true;
}

static bool extract_json_string_from(const char *json, const char *key, char *out, size_t out_len)
{
    const char *cursor;
    size_t i = 0;

    if (json == NULL || key == NULL || out == NULL || out_len == 0) {
        return false;
    }

    cursor = strstr(json, key);
    if (cursor == NULL) {
        return false;
    }

    cursor = strchr(cursor, ':');
    if (cursor == NULL) {
        return false;
    }
    cursor++;
    while (*cursor != '\0' && isspace((unsigned char)*cursor)) {
        cursor++;
    }
    if (*cursor != '"') {
        return false;
    }
    cursor++;

    while (*cursor != '\0' && *cursor != '"') {
        if (*cursor == '\\' && cursor[1] != '\0') {
            cursor++;
        }
        if (i + 1 < out_len) {
            out[i++] = *cursor;
        }
        cursor++;
    }

    if (*cursor != '"') {
        return false;
    }

    out[i] = '\0';
    return true;
}

static bool extract_top_level_uint(const char *json, const char *key, uint8_t *out)
{
    const char *cursor;
    unsigned int value = 0;
    int consumed = 0;

    if (json == NULL || key == NULL || out == NULL) {
        return false;
    }

    cursor = value_after_key(json, key);
    if (cursor == NULL || sscanf(cursor, "%u%n", &value, &consumed) != 1 || value > 100) {
        return false;
    }
    cursor += consumed;
    while (*cursor != '\0' && isspace((unsigned char)*cursor)) {
        cursor++;
    }
    if (*cursor != ',' && *cursor != '}') {
        return false;
    }

    *out = (uint8_t)value;
    return true;
}

static bool top_level_bool_equals(const char *json, const char *key, bool expected)
{
    const char *cursor = value_after_key(json, key);
    const char *literal = expected ? "true" : "false";
    size_t literal_len = strlen(literal);

    if (cursor == NULL || strncmp(cursor, literal, literal_len) != 0) {
        return false;
    }
    cursor += literal_len;
    while (*cursor != '\0' && isspace((unsigned char)*cursor)) {
        cursor++;
    }

    return *cursor == ',' || *cursor == '}';
}

static const char *find_matching_json_container(const char *start, char open_ch, char close_ch);
static bool extract_json_string_between(const char *start, const char *end, const char *key, char *out, size_t out_len);

/*
 * v1 lightweight parser limit: request options are read as a flat sequence of
 * option objects containing id/label pairs. It intentionally does not implement
 * a full JSON parser and should be replaced by the AliOS JSON stack later.
 */
static uint8_t extract_request_options(const char *json, combrief_option_t *options, uint8_t max_options)
{
    const char *options_array;
    const char *array_end;
    const char *cursor;
    uint8_t count = 0;

    if (json == NULL || options == NULL) {
        return 0;
    }

    options_array = value_after_key(json, "\"options\"");
    if (options_array == NULL || *options_array != '[') {
        return 0;
    }
    array_end = find_matching_json_container(options_array, '[', ']');
    if (array_end == NULL) {
        return 0;
    }

    cursor = options_array + 1;
    while (count < max_options && cursor < array_end && (cursor = strchr(cursor, '{')) != NULL && cursor < array_end) {
        const char *object_end = find_matching_json_container(cursor, '{', '}');
        if (object_end == NULL || object_end > array_end) {
            return 0;
        }

        if (extract_json_string_between(cursor, object_end, "\"id\"", options[count].id, sizeof(options[count].id)) &&
            extract_json_string_between(cursor, object_end, "\"label\"", options[count].label, sizeof(options[count].label)) &&
            options[count].id[0] != '\0' && options[count].label[0] != '\0') {
            count++;
        }

        cursor = object_end + 1;
    }

    return count;
}

static bool extract_json_string_between(const char *start, const char *end, const char *key, char *out, size_t out_len)
{
    const char *cursor;
    const char *colon;
    size_t key_len;
    size_t i = 0;
    int object_depth = 0;
    int array_depth = 0;
    bool in_string = false;
    bool escaped = false;

    if (start == NULL || end == NULL || key == NULL || out == NULL || out_len == 0 || start > end) {
        return false;
    }
    out[0] = '\0';
    key_len = strlen(key);

    for (cursor = start; cursor <= end; cursor++) {
        char ch = *cursor;

        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch == '\\' && in_string) {
            escaped = true;
            continue;
        }
        if (ch == '"') {
            if (!in_string && object_depth == 1 && array_depth == 0 &&
                (size_t)(end - cursor + 1) >= key_len &&
                strncmp(cursor, key, key_len) == 0) {
                break;
            }
            in_string = !in_string;
            continue;
        }
        if (!in_string && ch == '{') {
            object_depth++;
            continue;
        }
        if (!in_string && ch == '}') {
            object_depth--;
            if (object_depth < 0) {
                return false;
            }
            continue;
        }
        if (!in_string && ch == '[') {
            array_depth++;
            continue;
        }
        if (!in_string && ch == ']') {
            array_depth--;
            if (array_depth < 0) {
                return false;
            }
        }
    }
    if (cursor > end) {
        return false;
    }

    colon = cursor + key_len;
    while (colon < end && isspace((unsigned char)*colon)) {
        colon++;
    }
    if (colon >= end || *colon != ':') {
        return false;
    }
    colon++;
    while (colon < end && isspace((unsigned char)*colon)) {
        colon++;
    }
    if (colon >= end || *colon != '"') {
        return false;
    }
    colon++;

    while (colon < end && *colon != '"') {
        if (*colon == '\\' && colon + 1 < end) {
            colon++;
        }
        if (i + 1 < out_len) {
            out[i++] = *colon;
        }
        colon++;
    }

    if (colon >= end || *colon != '"') {
        out[0] = '\0';
        return false;
    }

    out[i] = '\0';
    return true;
}

static const char *find_matching_json_container(const char *start, char open_ch, char close_ch)
{
    const char *cursor;
    int depth = 0;
    bool in_string = false;
    bool escaped = false;

    if (start == NULL || *start != open_ch) {
        return NULL;
    }

    for (cursor = start; *cursor != '\0'; cursor++) {
        char ch = *cursor;

        if (escaped) {
            escaped = false;
        } else if (ch == '\\' && in_string) {
            escaped = true;
        } else if (ch == '"') {
            in_string = !in_string;
        } else if (!in_string && ch == open_ch) {
            depth++;
        } else if (!in_string && ch == close_ch) {
            depth--;
            if (depth == 0) {
                return cursor;
            }
            if (depth < 0) {
                return NULL;
            }
        }
    }

    return NULL;
}

static bool extract_apps_primary_status(const char *json, char *out, size_t out_len)
{
    char primary_id[32];
    char app_id[32];
    char app_status[32];
    char primary_status[32];
    const char *apps;
    const char *array_end;
    const char *cursor;
    bool has_primary;
    bool has_primary_status = false;
    bool has_working_status = false;
    bool first_status = true;

    if (out == NULL || out_len == 0) {
        return false;
    }
    out[0] = '\0';

    apps = value_after_key(json, "\"apps\"");
    if (apps == NULL || *apps != '[') {
        return false;
    }
    array_end = find_matching_json_container(apps, '[', ']');
    if (array_end == NULL) {
        return false;
    }

    has_primary = extract_top_level_string(json, "\"primary\"", primary_id, sizeof(primary_id)) && primary_id[0] != '\0';
    primary_status[0] = '\0';
    cursor = apps + 1;
    while (cursor < array_end && (cursor = strchr(cursor, '{')) != NULL && cursor < array_end) {
        const char *object_end = find_matching_json_container(cursor, '{', '}');
        if (object_end == NULL || object_end > array_end) {
            return false;
        }

        app_id[0] = '\0';
        app_status[0] = '\0';
        (void)extract_json_string_between(cursor, object_end, "\"id\"", app_id, sizeof(app_id));
        (void)extract_json_string_between(cursor, object_end, "\"status\"", app_status, sizeof(app_status));

        if (app_status[0] != '\0') {
            if (has_primary && strcmp(app_id, primary_id) == 0) {
                (void)snprintf(primary_status, sizeof(primary_status), "%s", app_status);
                has_primary_status = true;
            }
            if (strcmp(app_status, "working") == 0) {
                has_working_status = true;
            }
            if (first_status) {
                (void)snprintf(out, out_len, "%s", app_status);
                first_status = false;
            }
        }

        cursor = object_end + 1;
    }

    if (has_working_status) {
        (void)snprintf(out, out_len, "%s", "working");
        return true;
    }
    if (has_primary_status) {
        (void)snprintf(out, out_len, "%s", primary_status);
        return true;
    }

    return out[0] != '\0';
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

static bool append_summary_part(char *out, size_t out_len, const char *label, const char *status)
{
    size_t used;
    int written;
    const char *display_status;

    if (out == NULL || out_len == 0 || label == NULL || label[0] == '\0' || status == NULL || status[0] == '\0') {
        return false;
    }

    used = strlen(out);
    if (used >= out_len - 1) {
        return false;
    }

    display_status = display_status_label(status);
    written = snprintf(
        out + used,
        out_len - used,
        "%s%s [%s]",
        used == 0 ? "" : "\n",
        label,
        display_status);
    return written > 0 && (size_t)written < out_len - used;
}

static bool extract_apps_summary(const char *json, char *out, size_t out_len)
{
    char app_label[25];
    char app_status[32];
    const char *apps;
    const char *array_end;
    const char *cursor;
    uint8_t count = 0;

    if (out == NULL || out_len == 0) {
        return false;
    }
    out[0] = '\0';

    apps = value_after_key(json, "\"apps\"");
    if (apps == NULL || *apps != '[') {
        return false;
    }
    array_end = find_matching_json_container(apps, '[', ']');
    if (array_end == NULL) {
        return false;
    }

    cursor = apps + 1;
    while (count < 2 && cursor < array_end && (cursor = strchr(cursor, '{')) != NULL && cursor < array_end) {
        const char *object_end = find_matching_json_container(cursor, '{', '}');
        if (object_end == NULL || object_end > array_end) {
            return false;
        }

        app_label[0] = '\0';
        app_status[0] = '\0';
        (void)extract_json_string_between(cursor, object_end, "\"label\"", app_label, sizeof(app_label));
        (void)extract_json_string_between(cursor, object_end, "\"status\"", app_status, sizeof(app_status));
        if (append_summary_part(out, out_len, app_label, app_status)) {
            count++;
        }

        cursor = object_end + 1;
    }

    return out[0] != '\0';
}

static bool apply_state_message(combrief_app_state_t *state, const char *json)
{
    char status[64];
    char summary[64];
    uint8_t battery;
    bool state_changed = false;

    summary[0] = '\0';

    if (top_level_bool_equals(json, "\"connected\"", true) || top_level_bool_equals(json, "\"bleConnected\"", true)) {
        combrief_app_state_set_ble_connected(state, true);
        state_changed = true;
    }
    if (top_level_bool_equals(json, "\"connected\"", false) || top_level_bool_equals(json, "\"bleConnected\"", false)) {
        combrief_app_state_set_ble_connected(state, false);
        state_changed = true;
    }
    if (extract_top_level_uint(json, "\"battery\"", &battery)) {
        combrief_app_state_set_battery(state, battery);
        state_changed = true;
    }
    if (extract_top_level_string(json, "\"appSummary\"", summary, sizeof(summary)) ||
        extract_apps_summary(json, summary, sizeof(summary))) {
        combrief_app_state_set_app_summary(state, summary);
        state_changed = true;
    }
    if (extract_apps_primary_status(json, status, sizeof(status)) ||
        extract_top_level_string(json, "\"primaryStatus\"", status, sizeof(status)) ||
        extract_top_level_string(json, "\"status\"", status, sizeof(status)) ||
        extract_top_level_string(json, "\"primary\"", status, sizeof(status))) {
        combrief_app_state_set_primary_status(state, status);
        state_changed = true;
    }

    return state_changed;
}

static bool apply_request_message(combrief_app_state_t *state, const char *json)
{
    char decision_id[48];
    char brief[COMBRIEF_MAX_BRIEF_LEN + 1];
    char content[COMBRIEF_MAX_CONTENT_LEN + 1];
    combrief_option_t options[COMBRIEF_MAX_OPTIONS];
    uint8_t option_count;
    bool applied;

    memset(options, 0, sizeof(options));
    decision_id[0] = '\0';
    brief[0] = '\0';
    content[0] = '\0';

    (void)extract_top_level_string(json, "\"decisionId\"", decision_id, sizeof(decision_id));
    if (decision_id[0] == '\0') {
        printf("ComBrief request rejected missing decisionId\n");
        return false;
    }

    (void)extract_top_level_string(json, "\"brief\"", brief, sizeof(brief));
    (void)extract_top_level_string(json, "\"content\"", content, sizeof(content));
    option_count = extract_request_options(json, options, COMBRIEF_MAX_OPTIONS);
    if (option_count == 0) {
        printf("ComBrief request rejected options=0 briefLen=%u\n", (unsigned int)strlen(brief));
        return false;
    }

    applied = combrief_app_state_set_request(state, decision_id, brief, content, options, option_count);
    printf("ComBrief request %s briefLen=%u contentLen=%u options=%u\n",
        applied ? "applied" : "rejected",
        (unsigned int)strlen(brief),
        (unsigned int)strlen(content),
        (unsigned int)option_count);
    return applied;
}

static bool is_resolved_result(const char *result)
{
    return result != NULL && (
        strcmp(result, "approved") == 0 ||
        strcmp(result, "denied") == 0 ||
        strcmp(result, "selected") == 0 ||
        strcmp(result, "handled_elsewhere") == 0 ||
        strcmp(result, "expired") == 0 ||
        strcmp(result, "failed") == 0);
}

static bool apply_resolved_message(combrief_app_state_t *state, const char *json)
{
    char decision_id[48];
    char result[24];

    decision_id[0] = '\0';
    result[0] = '\0';

    (void)extract_top_level_string(json, "\"decisionId\"", decision_id, sizeof(decision_id));
    (void)extract_top_level_string(json, "\"result\"", result, sizeof(result));

    if (decision_id[0] == '\0' || result[0] == '\0') {
        return false;
    }
    if (state == NULL || state->decision_id[0] == '\0' || strcmp(decision_id, state->decision_id) != 0) {
        return false;
    }
    if (!is_resolved_result(result)) {
        return false;
    }

    combrief_app_state_mark_resolved(state, result);
    return true;
}

bool combrief_protocol_apply_host_message(combrief_app_state_t *state, const char *json)
{
    if (state == NULL || json == NULL) {
        return false;
    }
    if (!is_json_object(json) || !has_protocol_version(json)) {
        return false;
    }

    if (has_message_type(json, "state")) {
        return apply_state_message(state, json);
    }
    if (has_message_type(json, "request")) {
        return apply_request_message(state, json);
    }
    if (has_message_type(json, "resolved")) {
        return apply_resolved_message(state, json);
    }

    return false;
}
