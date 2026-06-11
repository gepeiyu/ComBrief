#include "power.h"

#include <stdio.h>

#include "../app_state/app_state.h"
#include "../ble_service/ble_service.h"
#include "../protocol/protocol.h"

#define COMBRIEF_POWER_FALLBACK_BATTERY_PERCENT 78
#define COMBRIEF_POWER_REPORT_PERIOD_TICKS 600

static unsigned int g_power_ticks;
static unsigned int g_battery_percent = COMBRIEF_POWER_FALLBACK_BATTERY_PERCENT;

static unsigned int read_platform_battery_percent(void)
{
    return COMBRIEF_POWER_FALLBACK_BATTERY_PERCENT;
}

unsigned int power_get_battery_percent(void)
{
    unsigned int battery_percent = read_platform_battery_percent();

    if (battery_percent > 100) {
        battery_percent = COMBRIEF_POWER_FALLBACK_BATTERY_PERCENT;
    }
    return battery_percent;
}

void power_init(void)
{
    g_power_ticks = 0;
    g_battery_percent = power_get_battery_percent();
    combrief_app_state_set_battery(combrief_app_state_get_mutable(), (uint8_t)g_battery_percent);
    printf("Power init battery percent fallback=%u\n", g_battery_percent);
}

void power_tick(void)
{
    char payload[128];
    combrief_app_state_t *state = combrief_app_state_get_mutable();

    g_power_ticks++;
    if ((g_power_ticks % COMBRIEF_POWER_REPORT_PERIOD_TICKS) != 0) {
        return;
    }

    g_battery_percent = power_get_battery_percent();
    combrief_app_state_set_battery(state, (uint8_t)g_battery_percent);
    if (combrief_protocol_build_battery(payload, sizeof(payload), state)) {
        (void)combrief_ble_send_json(payload);
    }
}
