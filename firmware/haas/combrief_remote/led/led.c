#include "led.h"

#include <stdio.h>
#include <string.h>

#include "../app_state/app_state.h"

#if defined(BOARD_HAASEDUK1)
#include <aos/kernel.h>
#define COMBRIEF_HAS_HAAS_LED 1
typedef enum { LED_OFF, LED_ON } led_e;
typedef enum { LED1_NUM = 1, LED2_NUM = 2, LED3_NUM = 3 } led_num_e;
void led_switch(led_num_e id, led_e onoff);
#else
#define COMBRIEF_HAS_HAAS_LED 0
typedef enum { LED_OFF, LED_ON } led_e;
typedef enum { LED1_NUM = 1, LED2_NUM = 2, LED3_NUM = 3 } led_num_e;
#endif

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

#define COMBRIEF_ADVERTISING_LED_HOLD_TICKS 4
#define COMBRIEF_WORKING_PWM_STEPS 7
#define COMBRIEF_SOFTWARE_PWM_PERIOD_MS 20
#define COMBRIEF_SOFTWARE_PWM_UPDATE_FRAMES 4

static uint8_t g_advertising_cycle;
static uint8_t g_advertising_hold_ticks;
static uint8_t g_working_breath_tick;
static bool g_working_breath_up;
static volatile bool g_blue_software_breathing;
static volatile uint8_t g_blue_software_target;
static uint8_t g_waiting_user_breath_tick;

static led_num_e board_led_for_color(combrief_led_color_t color)
{
    switch (color) {
    case COMBRIEF_LED_RED:
        return LED1_NUM;
    case COMBRIEF_LED_GREEN:
        return LED2_NUM;
    case COMBRIEF_LED_BLUE:
    default:
        return LED3_NUM;
    }
}

static void disable_blue_software_breathing(void)
{
    g_blue_software_breathing = false;
    g_blue_software_target = 0;
}

static void set_board_leds(combrief_led_color_t color)
{
#if COMBRIEF_HAS_HAAS_LED
    disable_blue_software_breathing();
    led_switch(LED1_NUM, color == COMBRIEF_LED_RED ? LED_ON : LED_OFF);
    led_switch(LED2_NUM, color == COMBRIEF_LED_GREEN ? LED_ON : LED_OFF);
    led_switch(LED3_NUM, color == COMBRIEF_LED_BLUE ? LED_ON : LED_OFF);
#else
    (void)board_led_for_color(color);
#endif
}

static void set_board_leds_off(void)
{
#if COMBRIEF_HAS_HAAS_LED
    disable_blue_software_breathing();
    led_switch(LED1_NUM, LED_OFF);
    led_switch(LED2_NUM, LED_OFF);
    led_switch(LED3_NUM, LED_OFF);
#endif
}

static void run_blue_software_pwm_frame(uint8_t target)
{
#if COMBRIEF_HAS_HAAS_LED
    uint32_t on_ms = ((uint32_t)target * COMBRIEF_SOFTWARE_PWM_PERIOD_MS) / 100U;
    uint32_t off_ms = COMBRIEF_SOFTWARE_PWM_PERIOD_MS - on_ms;

    led_switch(LED1_NUM, LED_OFF);
    led_switch(LED2_NUM, LED_OFF);
    if (on_ms > 0U) {
        led_switch(LED3_NUM, LED_ON);
        aos_msleep(on_ms);
    }
    if (off_ms > 0U) {
        led_switch(LED3_NUM, LED_OFF);
        aos_msleep(off_ms);
    }
#else
    (void)target;
#endif
}

#if COMBRIEF_HAS_HAAS_LED
static void led_software_pwm_task(void *arg)
{
    uint8_t brightness = 10;
    uint8_t frame_count = 0;
    bool breath_up = true;

    (void)arg;
    while (1) {
        if (g_blue_software_breathing) {
            run_blue_software_pwm_frame(brightness);
            frame_count++;
            if (frame_count >= COMBRIEF_SOFTWARE_PWM_UPDATE_FRAMES) {
                frame_count = 0;
                if (breath_up) {
                    if (brightness >= 100) {
                        breath_up = false;
                        brightness = 98;
                    } else {
                        brightness = (uint8_t)(brightness + 2);
                    }
                } else if (brightness <= 10) {
                    breath_up = true;
                    brightness = 12;
                } else {
                    brightness = (uint8_t)(brightness - 2);
                }
            }
        } else {
            brightness = 10;
            frame_count = 0;
            breath_up = true;
            aos_msleep(COMBRIEF_SOFTWARE_PWM_PERIOD_MS);
        }
    }
}
#endif

static void set_led(combrief_led_color_t color, const char *reason)
{
    const char *name = color == COMBRIEF_LED_RED ? "red" : (color == COMBRIEF_LED_GREEN ? "green" : "blue");
    set_board_leds(color);
    printf("LED %s: %s\n", name, reason);
}

static void set_red_breathing_led(void)
{
    if (g_waiting_user_breath_tick < 3) {
        set_led(COMBRIEF_LED_RED, "connected waiting user red breathing on");
    } else {
        set_board_leds_off();
        printf("LED red off: connected waiting user red breathing\n");
    }
    g_waiting_user_breath_tick = (uint8_t)((g_waiting_user_breath_tick + 1) % 4);
}

static void set_blue_breathing_led(void)
{
    static const uint8_t brightness_steps[COMBRIEF_WORKING_PWM_STEPS] = {10, 25, 40, 55, 70, 85, 100};
    uint8_t target = brightness_steps[g_working_breath_tick];

#if COMBRIEF_HAS_HAAS_LED
    g_blue_software_target = target;
    g_blue_software_breathing = true;
#else
    (void)target;
#endif
    printf("LED blue: connected working blue software breathing target=%u\n", (unsigned int)target);
    if (g_working_breath_up) {
        if (g_working_breath_tick + 1 >= COMBRIEF_WORKING_PWM_STEPS) {
            g_working_breath_up = false;
            g_working_breath_tick--;
        } else {
            g_working_breath_tick++;
        }
    } else if (g_working_breath_tick == 0) {
        g_working_breath_up = true;
        g_working_breath_tick++;
    } else {
        g_working_breath_tick--;
    }
}

static bool status_is_waiting_user(const combrief_app_state_t *state)
{
    return state != NULL && (
        strstr(state->primary_status, "waiting_user") != NULL ||
        strstr(state->primary_status, "waiting") != NULL ||
        strstr(state->primary_status, "需确认") != NULL ||
        strstr(state->app_summary, "[需确认]") != NULL);
}

static bool status_is_working(const combrief_app_state_t *state)
{
    return state != NULL && (
        strstr(state->primary_status, "WORKING") != NULL ||
        strstr(state->primary_status, "Working") != NULL ||
        strstr(state->primary_status, "working") != NULL ||
        strstr(state->primary_status, "工作中") != NULL ||
        strstr(state->app_summary, "[工作中]") != NULL ||
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
    g_advertising_hold_ticks++;
    if (g_advertising_hold_ticks >= COMBRIEF_ADVERTISING_LED_HOLD_TICKS) {
        g_advertising_hold_ticks = 0;
        g_advertising_cycle = (uint8_t)((g_advertising_cycle + 1) % 3);
    }
}

void led_init(void)
{
    g_advertising_cycle = 0;
    g_advertising_hold_ticks = 0;
    g_working_breath_tick = 0;
    g_working_breath_up = true;
    g_blue_software_breathing = false;
    g_blue_software_target = 0;
    g_waiting_user_breath_tick = 0;
#if COMBRIEF_HAS_HAAS_LED
    aos_task_t task;
    int task_result = aos_task_new_ext(&task, "cmb_led_pwm", led_software_pwm_task, NULL, 1024, 40);
#else
    int task_result = 0;
#endif
    set_board_leds(COMBRIEF_LED_RED);
    printf("ComBrief LED init priority red > green > blue software_pwm_task=%d\n", task_result);
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

    if (status_is_waiting_user(state)) {
        set_red_breathing_led();
        return;
    }

    if (status_is_working(state)) {
        set_blue_breathing_led();
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
