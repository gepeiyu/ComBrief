#ifndef COMBRIEF_BLE_SERVICE_H
#define COMBRIEF_BLE_SERVICE_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define COMBRIEF_BLE_DEVICE_NAME "ComBrief-Remote"
#define COMBRIEF_BLE_SERVICE_UUID "7b5c0001-8d4a-4c3a-9b4f-434252465001"
#define COMBRIEF_BLE_HOST_TX_UUID "7b5c0002-8d4a-4c3a-9b4f-434252465001"
#define COMBRIEF_BLE_DEVICE_TX_UUID "7b5c0003-8d4a-4c3a-9b4f-434252465001"

void ble_service_init(const char *device_name, const char *service_uuid);
void ble_service_start(void);
void ble_service_start_advertising(void);
void ble_service_tick(void);
bool combrief_ble_send_json(const char *json);
bool ble_service_send_json(const char *json);
bool ble_service_handle_host_write(const char *json);
void ble_service_on_connected(void);
void ble_service_on_disconnected(void);

#ifdef __cplusplus
}
#endif

#endif
