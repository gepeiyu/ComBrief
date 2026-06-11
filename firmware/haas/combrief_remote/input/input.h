#ifndef COMBRIEF_INPUT_H
#define COMBRIEF_INPUT_H

#include <stdbool.h>

#include "../app_state/app_state.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    COMBRIEF_KEY_NONE = 0,
    COMBRIEF_KEY_K1,
    COMBRIEF_KEY_K2,
    COMBRIEF_KEY_K3,
    COMBRIEF_KEY_K4
} combrief_key_t;

typedef bool (*combrief_input_send_json_fn)(const char *json);

void input_init(void);
void input_tick(void);
bool combrief_input_handle_key(combrief_app_state_t *state, combrief_key_t key, combrief_input_send_json_fn send_json);

#ifdef __cplusplus
}
#endif

#endif
