#ifndef COMBRIEF_APP_STATE_H
#define COMBRIEF_APP_STATE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    COMBRIEF_REMOTE_DISCONNECTED = 0,
    COMBRIEF_REMOTE_IDLE,
    COMBRIEF_REMOTE_REQUEST_ACTIVE,
    COMBRIEF_REMOTE_DECISION_PENDING,
    COMBRIEF_REMOTE_WAITING_RESOLVED
} combrief_remote_state_t;

typedef enum {
    COMBRIEF_DISPLAY_SUMMARY = 0,
    COMBRIEF_DISPLAY_FULL
} combrief_display_mode_t;

typedef struct {
    char id[32];
    char label[25];
} combrief_option_t;

typedef struct {
    bool ble_connected;
    combrief_remote_state_t remote_state;
    combrief_display_mode_t display_mode;
    char app_version[16];
    char primary_status[64];
    char app_summary[64];
    bool battery_known;
    uint8_t battery_percent;
    char decision_id[48];
    char brief[49];
    char content[81];
    combrief_option_t options[3];
    uint8_t option_count;
    uint8_t selected_option;
    uint8_t full_page;
    bool waiting_resolved;
    bool waiting_request_content;
    char last_resolved_result[24];
} combrief_app_state_t;

void app_state_init(void);
void app_state_tick(void);

void combrief_app_state_init(combrief_app_state_t *state);
combrief_app_state_t *combrief_app_state_get_mutable(void);
const combrief_app_state_t *combrief_app_state_get(void);
void combrief_app_state_set_ble_connected(combrief_app_state_t *state, bool connected);
void combrief_app_state_set_primary_status(combrief_app_state_t *state, const char *status);
void combrief_app_state_set_app_summary(combrief_app_state_t *state, const char *summary);
void combrief_app_state_apply_fast_status(combrief_app_state_t *state, const char *label, const char *status);
void combrief_app_state_set_battery(combrief_app_state_t *state, uint8_t percent);
void combrief_app_state_set_battery_unknown(combrief_app_state_t *state);
bool combrief_app_state_set_request(
    combrief_app_state_t *state,
    const char *decision_id,
    const char *brief,
    const char *content,
    const combrief_option_t *options,
    uint8_t option_count);
bool combrief_app_state_select_next(combrief_app_state_t *state);
bool combrief_app_state_select_prev(combrief_app_state_t *state);
void combrief_app_state_toggle_full(combrief_app_state_t *state);
void combrief_app_state_mark_decision_sent(combrief_app_state_t *state);
void combrief_app_state_clear_request(combrief_app_state_t *state);
void combrief_app_state_mark_resolved(combrief_app_state_t *state, const char *result);

#ifdef __cplusplus
}
#endif

#endif
