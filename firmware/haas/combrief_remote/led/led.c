#include "led.h"

#include <stdio.h>
#include <string.h>

#include "../app_state/app_state.h"

typedef enum {
    COMBRIEF_LED_RED = 0,
    COMBRIEF_LED_GREEN,
    COMBRIEF_LED_BLUE
} combrief_led_color_t;

typedef enum {
    COMBRIEF_REMOTE_ADVERTISING = 0,
    COMBRIEF_REMOTE_SHOWING_REQUEST,
    COMBRIEF_REMOTE_CONNECTED_IDLE,
    COMBRIEF_REMOTE_CONNECTED_WORKING
} combrief_led_view_t;

static uint8_t g_advertising_cycle;

static void set_led(combrief_led_color_t color, const char *reason)
{
    const char *name = color == COMBRIEF_LED_RED ? "red" : (color == COMBRIEF_LED_GREEN ? "green" : "blue");
    printf("LED %s: %s\n", name, reason);
}

static bool status_is_working(const combrief_app_state_t *state)
{
    return state != NULL && (
        strstr(state->primary_status, "WORKING") != NULL ||
        strstr(state->primary_status, "Working") != NULL ||
        strstr(state->primary_status, "working") != NULL ||
        (state->remote_state != COMBRIEF_REMOTE_IDLE && state->remote_state != COMBRIEF_REMOTE_DISCONNECTED));
}

static void set_advertising_led(void)
{
    static const combrief_led_color_t cycle[] = {
        COMBRIEF_LED_RED,
        COMBRIEF_LED_GREEN,
        COMBRIEF_LED_BLUE,
    };
    set_led(cycle[g_advertising_cycle], "COMBRIEF_REMOTE_ADVERTISING red green blue cycle");
    g_advertising_cycle = (uint8_t)((g_advertising_cycle + 1) % 3);
}

void led_init(void)
{
    g_advertising_cycle = 0;
    printf("ComBrief LED init priority red > green > blue\n");
}

void led_render(void)
{
    const combrief_app_state_t *state = combrief_app_state_get();

    if (state == NULL || !state->ble_connected || state->remote_state == COMBRIEF_REMOTE_DISCONNECTED) {
        set_advertising_led();
        return;
    }

    if (state->remote_state == COMBRIEF_REMOTE_WAITING_RESOLVED || state->waiting_resolved) {
        set_led(COMBRIEF_LED_RED, "COMBRIEF_REMOTE_WAITING_RESOLVED connected working priority");
        return;
    }

    if (state->remote_state == COMBRIEF_REMOTE_REQUEST_ACTIVE || state->remote_state == COMBRIEF_REMOTE_DECISION_PENDING) {
        set_led(COMBRIEF_LED_RED, "COMBRIEF_REMOTE_SHOWING_REQUEST connected working priority");
        return;
    }

    if (status_is_working(state)) {
        set_led(COMBRIEF_LED_BLUE, "connected working blue breathing");
        return;
    }

    set_led(COMBRIEF_LED_GREEN, "connected idle");
    (void)COMBRIEF_REMOTE_CONNECTED_IDLE;
    (void)COMBRIEF_REMOTE_CONNECTED_WORKING;
}

void led_tick(void)
{
    led_render();
}
