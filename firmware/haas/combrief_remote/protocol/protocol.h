#ifndef COMBRIEF_PROTOCOL_H
#define COMBRIEF_PROTOCOL_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "../app_state/app_state.h"

#ifdef __cplusplus
extern "C" {
#endif

#define COMBRIEF_PROTOCOL_VERSION 1
#define COMBRIEF_MAX_BRIEF_LEN 48
#define COMBRIEF_MAX_CONTENT_LEN 80
#define COMBRIEF_MAX_OPTIONS 3
#define COMBRIEF_MAX_OPTION_LABEL_LEN 12
#define COMBRIEF_REMOTE_NAME "ComBrief"
#define COMBRIEF_REMOTE_PLATFORM "haas-edu-k1"
#define COMBRIEF_REMOTE_FW_VERSION "0.1.0"

void protocol_init(void);
void protocol_tick(void);

bool combrief_protocol_build_hello(char *out, size_t out_len, const combrief_app_state_t *state);
bool combrief_protocol_build_decision(char *out, size_t out_len, const combrief_app_state_t *state);
bool combrief_protocol_build_battery(char *out, size_t out_len, const combrief_app_state_t *state);
bool combrief_protocol_apply_host_message(combrief_app_state_t *state, const char *json);

#ifdef __cplusplus
}
#endif

#endif
