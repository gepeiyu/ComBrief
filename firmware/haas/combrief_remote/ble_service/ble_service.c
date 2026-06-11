#include "ble_service.h"

#include <stdio.h>
#include <string.h>

#include "../app_state/app_state.h"
#include "../protocol/protocol.h"

#define COMBRIEF_BLE_TX_BUFFER_LEN 512

static const char *k_combrief_ble_device_name = COMBRIEF_BLE_DEVICE_NAME;
static const char *k_combrief_ble_service_uuid = COMBRIEF_BLE_SERVICE_UUID;
static const char *k_combrief_ble_host_tx_uuid = COMBRIEF_BLE_HOST_TX_UUID;
static const char *k_combrief_ble_device_tx_uuid = COMBRIEF_BLE_DEVICE_TX_UUID;

static char g_device_name[32] = COMBRIEF_BLE_DEVICE_NAME;
static char g_service_uuid[40] = COMBRIEF_BLE_SERVICE_UUID;
static bool g_advertising;
static bool g_connected;

static void copy_or_default(char *dest, size_t dest_len, const char *value, const char *fallback)
{
    if (dest == NULL || dest_len == 0) {
        return;
    }

    (void)snprintf(dest, dest_len, "%s", value != NULL && value[0] != '\0' ? value : fallback);
}

void ble_service_init(const char *device_name, const char *service_uuid)
{
    copy_or_default(g_device_name, sizeof(g_device_name), device_name, k_combrief_ble_device_name);
    copy_or_default(g_service_uuid, sizeof(g_service_uuid), service_uuid, k_combrief_ble_service_uuid);
    g_advertising = false;
    g_connected = false;

    printf("ComBrief-Remote BLE init name=%s service=%s host_tx=%s device_tx=%s\n",
        g_device_name,
        g_service_uuid,
        k_combrief_ble_host_tx_uuid,
        k_combrief_ble_device_tx_uuid);
}

void ble_service_start(void)
{
    ble_service_start_advertising();
}

void ble_service_start_advertising(void)
{
    g_advertising = true;
    printf("ComBrief-Remote BLE advertising %s service UUID %s\n", g_device_name, g_service_uuid);
}

void ble_service_tick(void)
{
}

bool combrief_ble_send_json(const char *json)
{
    size_t payload_len;

    if (json == NULL || json[0] == '\0' || !g_connected) {
        return false;
    }

    payload_len = strlen(json);
    printf("ComBrief-Remote BLE notify characteristic=%s length=%u\n",
        k_combrief_ble_device_tx_uuid,
        (unsigned int)payload_len);
    return true;
}

bool ble_service_send_json(const char *json)
{
    return combrief_ble_send_json(json);
}

bool ble_service_handle_host_write(const char *json)
{
    combrief_app_state_t *state = combrief_app_state_get_mutable();
    size_t payload_len;

    if (json == NULL || state == NULL) {
        return false;
    }

    payload_len = strlen(json);
    printf("ComBrief-Remote BLE host write characteristic=%s length=%u\n",
        k_combrief_ble_host_tx_uuid,
        (unsigned int)payload_len);
    return combrief_protocol_apply_host_message(state, json);
}

void ble_service_on_connected(void)
{
    char hello[COMBRIEF_BLE_TX_BUFFER_LEN];
    combrief_app_state_t *state = combrief_app_state_get_mutable();

    g_connected = true;
    g_advertising = false;
    combrief_app_state_set_ble_connected(state, true);

    if (combrief_protocol_build_hello(hello, sizeof(hello), state)) {
        (void)combrief_ble_send_json(hello);
    }
}

void ble_service_on_disconnected(void)
{
    g_connected = false;
    combrief_app_state_set_ble_connected(combrief_app_state_get_mutable(), false);
    ble_service_start_advertising();
}
