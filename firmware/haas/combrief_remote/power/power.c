#include "power.h"

#include <stdio.h>

#include "../app_state/app_state.h"
#include "../ble_service/ble_service.h"
#include "../protocol/protocol.h"

#if defined(BOARD_HAASEDUK1)
#include "aos/hal/adc.h"
#define COMBRIEF_HAS_HAAS_ADC 1
#else
#define COMBRIEF_HAS_HAAS_ADC 0
#endif

#define COMBRIEF_POWER_UNKNOWN_BATTERY_PERCENT 255U
#define COMBRIEF_POWER_REPORT_PERIOD_TICKS 600
#define COMBRIEF_POWER_HAAS_ADC_PORT 1
#define COMBRIEF_POWER_MIN_MV 3300U
#define COMBRIEF_POWER_MAX_MV 4200U
#define COMBRIEF_POWER_SAMPLE_COUNT 8U

static unsigned int g_power_ticks;
static unsigned int g_battery_percent = COMBRIEF_POWER_UNKNOWN_BATTERY_PERCENT;

static unsigned int voltage_mv_to_percent(unsigned int voltage_mv)
{
    if (voltage_mv <= COMBRIEF_POWER_MIN_MV) {
        return 0;
    }
    if (voltage_mv >= COMBRIEF_POWER_MAX_MV) {
        return 100;
    }
    return ((voltage_mv - COMBRIEF_POWER_MIN_MV) * 100U) / (COMBRIEF_POWER_MAX_MV - COMBRIEF_POWER_MIN_MV);
}

static unsigned int read_platform_battery_percent(void)
{
#if COMBRIEF_HAS_HAAS_ADC
    adc_dev_t adc = {COMBRIEF_POWER_HAAS_ADC_PORT, {1000}, NULL};
    uint32_t sample_mv = 0;
    uint32_t sum_mv = 0;
    uint32_t samples = 0;

    if (hal_adc_init(&adc) != 0) {
        return COMBRIEF_POWER_UNKNOWN_BATTERY_PERCENT;
    }

    for (uint32_t i = 0; i < COMBRIEF_POWER_SAMPLE_COUNT; i++) {
        if (hal_adc_value_get(&adc, &sample_mv, 1000) == 0 && sample_mv > 0) {
            sum_mv += sample_mv;
            samples++;
        }
    }

    (void)hal_adc_finalize(&adc);

    if (samples == 0) {
        return COMBRIEF_POWER_UNKNOWN_BATTERY_PERCENT;
    }

    uint32_t average_mv = sum_mv / samples;
    if (average_mv < COMBRIEF_POWER_MIN_MV) {
        return COMBRIEF_POWER_UNKNOWN_BATTERY_PERCENT;
    }

    return voltage_mv_to_percent(average_mv);
#else
    return COMBRIEF_POWER_UNKNOWN_BATTERY_PERCENT;
#endif
}

unsigned int power_get_battery_percent(void)
{
    unsigned int battery_percent = read_platform_battery_percent();

    if (battery_percent > 100) {
        battery_percent = COMBRIEF_POWER_UNKNOWN_BATTERY_PERCENT;
    }
    return battery_percent;
}

void power_init(void)
{
    g_power_ticks = 0;
    g_battery_percent = power_get_battery_percent();
    if (g_battery_percent <= 100) {
        combrief_app_state_set_battery(combrief_app_state_get_mutable(), (uint8_t)g_battery_percent);
    } else {
        combrief_app_state_set_battery_unknown(combrief_app_state_get_mutable());
    }
    printf("Power init battery percent=%s%u\n", g_battery_percent <= 100 ? "" : "unknown/", g_battery_percent);
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
    if (g_battery_percent <= 100) {
        combrief_app_state_set_battery(state, (uint8_t)g_battery_percent);
        if (combrief_protocol_build_battery(payload, sizeof(payload), state)) {
            (void)combrief_ble_send_json(payload);
        }
    } else {
        combrief_app_state_set_battery_unknown(state);
    }
}
