#include <stdio.h>

#include "app_state/app_state.h"
#include "protocol/protocol.h"
#include "ble_service/ble_service.h"
#include "display/display.h"
#include "input/input.h"
#include "led/led.h"
#include "power/power.h"

#define COMBRIEF_REMOTE_DEVICE_NAME "ComBrief-Remote"
#define COMBRIEF_REMOTE_SERVICE_UUID "7b5c0001-8d4a-4c3a-9b4f-434252465001"

int application_start(int argc, char *argv[])
{
    (void)argc;
    (void)argv;

    printf("%s boot\n", COMBRIEF_REMOTE_DEVICE_NAME);
    printf("%s advertising as %s\n", COMBRIEF_REMOTE_DEVICE_NAME, COMBRIEF_REMOTE_DEVICE_NAME);
    printf("%s service UUID: %s\n", COMBRIEF_REMOTE_DEVICE_NAME, COMBRIEF_REMOTE_SERVICE_UUID);

    app_state_init();
    protocol_init();
    display_init();
    input_init();
    led_init();
    power_init();
    ble_service_init(COMBRIEF_REMOTE_DEVICE_NAME, COMBRIEF_REMOTE_SERVICE_UUID);
    ble_service_start_advertising();

    while (1) {
        app_state_tick();
        protocol_tick();
        ble_service_tick();
        display_tick();
        input_tick();
        led_tick();
        power_tick();
    }

    return 0;
}
