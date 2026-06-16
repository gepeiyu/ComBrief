#include "ble_service.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "../app_state/app_state.h"
#include "../protocol/protocol.h"

#if defined(BOARD_HAASEDUK1)
#include <aos/ble.h>
void hci_h4_driver_init(void);
#endif

#define COMBRIEF_BLE_TX_BUFFER_LEN 512
#define COMBRIEF_HELLO_RETRY_TICKS 4

#if defined(BOARD_HAASEDUK1)
#define COMBRIEF_HAS_HAAS_BLE 1
#else
#define COMBRIEF_HAS_HAAS_BLE 0
#endif

#if COMBRIEF_HAS_HAAS_BLE
#define COMBRIEF_SERVICE_UUID_VALUE UUID128_DECLARE(0x01, 0x50, 0x46, 0x52, 0x42, 0x43, 0x4f, 0x9b, 0x3a, 0x4c, 0x4a, 0x8d, 0x01, 0x00, 0x5c, 0x7b)
#define COMBRIEF_HOST_TX_UUID_VALUE UUID128_DECLARE(0x01, 0x50, 0x46, 0x52, 0x42, 0x43, 0x4f, 0x9b, 0x3a, 0x4c, 0x4a, 0x8d, 0x02, 0x00, 0x5c, 0x7b)
#define COMBRIEF_DEVICE_TX_UUID_VALUE UUID128_DECLARE(0x01, 0x50, 0x46, 0x52, 0x42, 0x43, 0x4f, 0x9b, 0x3a, 0x4c, 0x4a, 0x8d, 0x03, 0x00, 0x5c, 0x7b)
#define COMBRIEF_CONTROL_UUID_VALUE UUID128_DECLARE(0x01, 0x50, 0x46, 0x52, 0x42, 0x43, 0x4f, 0x9b, 0x3a, 0x4c, 0x4a, 0x8d, 0x05, 0x00, 0x5c, 0x7b)

enum {
    COMBRIEF_GATT_IDX_SVC,
    COMBRIEF_GATT_IDX_HOST_TX_CHAR,
    COMBRIEF_GATT_IDX_HOST_TX_VAL,
    COMBRIEF_GATT_IDX_DEVICE_TX_CHAR,
    COMBRIEF_GATT_IDX_DEVICE_TX_VAL,
    COMBRIEF_GATT_IDX_DEVICE_TX_CCC,
    COMBRIEF_GATT_IDX_CONTROL_CHAR,
    COMBRIEF_GATT_IDX_CONTROL_VAL,
    COMBRIEF_GATT_IDX_MAX,
};

static gatt_service g_combrief_gatt_service;
static gatt_attr_t g_combrief_gatt_attrs[COMBRIEF_GATT_IDX_MAX] = {
    [COMBRIEF_GATT_IDX_SVC] = GATT_PRIMARY_SERVICE_DEFINE(COMBRIEF_SERVICE_UUID_VALUE),
    [COMBRIEF_GATT_IDX_HOST_TX_CHAR] = GATT_CHAR_DEFINE(COMBRIEF_HOST_TX_UUID_VALUE, GATT_CHRC_PROP_WRITE | GATT_CHRC_PROP_WRITE_WITHOUT_RESP),
    [COMBRIEF_GATT_IDX_HOST_TX_VAL] = GATT_CHAR_VAL_DEFINE(COMBRIEF_HOST_TX_UUID_VALUE, GATT_PERM_WRITE),
    [COMBRIEF_GATT_IDX_DEVICE_TX_CHAR] = GATT_CHAR_DEFINE(COMBRIEF_DEVICE_TX_UUID_VALUE, GATT_CHRC_PROP_NOTIFY | GATT_CHRC_PROP_READ),
    [COMBRIEF_GATT_IDX_DEVICE_TX_VAL] = GATT_CHAR_VAL_DEFINE(COMBRIEF_DEVICE_TX_UUID_VALUE, GATT_PERM_READ),
    [COMBRIEF_GATT_IDX_DEVICE_TX_CCC] = GATT_CHAR_CCC_DEFINE(),
    [COMBRIEF_GATT_IDX_CONTROL_CHAR] = GATT_CHAR_DEFINE(COMBRIEF_CONTROL_UUID_VALUE, GATT_CHRC_PROP_WRITE_WITHOUT_RESP | GATT_CHRC_PROP_WRITE),
    [COMBRIEF_GATT_IDX_CONTROL_VAL] = GATT_CHAR_VAL_DEFINE(COMBRIEF_CONTROL_UUID_VALUE, GATT_PERM_WRITE),
};

static int16_t g_conn_handle = -1;
static int g_service_handle = -1;
static bool g_stack_ready;
static bool g_service_ready;
#endif

static const char *k_combrief_ble_device_name = COMBRIEF_BLE_DEVICE_NAME;
static const char *k_combrief_ble_service_uuid = COMBRIEF_BLE_SERVICE_UUID;
static const char *k_combrief_ble_host_tx_uuid = COMBRIEF_BLE_HOST_TX_UUID;
static const char *k_combrief_ble_device_tx_uuid = COMBRIEF_BLE_DEVICE_TX_UUID;
static const char *k_combrief_ble_control_uuid = COMBRIEF_BLE_CONTROL_UUID;

static char g_device_name[32] = COMBRIEF_BLE_DEVICE_NAME;
static char g_service_uuid[40] = COMBRIEF_BLE_SERVICE_UUID;
static char g_host_rx_buffer[COMBRIEF_BLE_TX_BUFFER_LEN];
static size_t g_host_rx_len;
static bool g_advertising;
static bool g_connected;
static bool g_notify_enabled;
static bool g_awaiting_host_sync;
static uint8_t g_hello_retry_ticks;

static void copy_or_default(char *dest, size_t dest_len, const char *value, const char *fallback)
{
    if (dest == NULL || dest_len == 0) {
        return;
    }

    (void)snprintf(dest, dest_len, "%s", value != NULL && value[0] != '\0' ? value : fallback);
}

static bool ble_service_extract_host_message_id(const char *json, char *out, size_t out_len)
{
    const char *key;
    const char *cursor;
    size_t used = 0;

    if (json == NULL || out == NULL || out_len == 0) {
        return false;
    }

    key = strstr(json, "\"hostMessageId\"");
    if (key == NULL) {
        out[0] = '\0';
        return false;
    }

    cursor = strchr(key, ':');
    if (cursor == NULL) {
        out[0] = '\0';
        return false;
    }
    cursor++;
    while (*cursor == ' ' || *cursor == '\t' || *cursor == '\r' || *cursor == '\n') {
        cursor++;
    }
    if (*cursor != '\"') {
        out[0] = '\0';
        return false;
    }
    cursor++;

    while (*cursor != '\0' && *cursor != '\"') {
        if (*cursor == '\\') {
            cursor++;
            if (*cursor == '\0') {
                out[0] = '\0';
                return false;
            }
        }
        if (used + 1 >= out_len) {
            out[0] = '\0';
            return false;
        }
        out[used++] = *cursor++;
    }

    if (*cursor != '\"') {
        out[0] = '\0';
        return false;
    }

    out[used] = '\0';
    return used > 0;
}

static bool ble_service_send_host_ack(const char *host_message_id, bool ok, const char *error)
{
    char ack[COMBRIEF_BLE_TX_BUFFER_LEN];

    if (host_message_id == NULL || host_message_id[0] == '\0') {
        return false;
    }
    if (!combrief_protocol_build_host_ack(ack, sizeof(ack), host_message_id, ok, error)) {
        return false;
    }

    return combrief_ble_send_json(ack);
}

static bool ble_service_send_hello(void)
{
    char hello[COMBRIEF_BLE_TX_BUFFER_LEN];
    const combrief_app_state_t *state = combrief_app_state_get();

    if (!g_connected || !g_notify_enabled) {
        return false;
    }
    if (!combrief_protocol_build_hello(hello, sizeof(hello), state)) {
        return false;
    }
    if (!combrief_ble_send_json(hello)) {
        return false;
    }

    g_hello_retry_ticks = 0;
    return true;
}

void ble_service_on_notify_enabled(bool enabled)
{
    g_notify_enabled = enabled;
    if (!enabled) {
        return;
    }

    g_hello_retry_ticks = COMBRIEF_HELLO_RETRY_TICKS;
    (void)ble_service_send_hello();
}

#if COMBRIEF_HAS_HAAS_BLE
static void handle_gap_connection_change(const evt_data_gap_conn_change_t *event_data)
{
    if (event_data == NULL) {
        return;
    }

    if (event_data->connected == CONNECTED) {
        g_conn_handle = event_data->conn_handle;
        ble_service_on_connected();
        printf("ComBrief BLE connected handle=%d\n", (int)g_conn_handle);
        return;
    }

    g_conn_handle = -1;
    g_notify_enabled = false;
    ble_service_on_disconnected();
    printf("ComBrief BLE disconnected err=%d\n", (int)event_data->err);
}

static void handle_gatt_write(evt_data_gatt_char_write_t *event_data)
{
    uint16_t host_value_handle;
    uint16_t control_value_handle;
    char payload[COMBRIEF_BLE_TX_BUFFER_LEN];
    size_t copy_len;

    if (event_data == NULL || g_service_handle < 0) {
        return;
    }

    host_value_handle = (uint16_t)(g_service_handle + COMBRIEF_GATT_IDX_HOST_TX_VAL);
    control_value_handle = (uint16_t)(g_service_handle + COMBRIEF_GATT_IDX_CONTROL_VAL);
    if ((uint16_t)event_data->char_handle != host_value_handle &&
        (uint16_t)event_data->char_handle != control_value_handle) {
        return;
    }

    if (event_data->offset != 0) {
        printf("ComBrief BLE host write rejected offset=%u flag=%u\n", (unsigned int)event_data->offset, (unsigned int)event_data->flag);
        event_data->len = -ATT_ERR_NOT_SUPPORTED;
        return;
    }

    if (event_data->len <= 0 || event_data->data == NULL || event_data->len >= (int32_t)sizeof(payload)) {
        event_data->len = -ATT_ERR_INVALID_ATTRIBUTE_LEN;
        return;
    }

    copy_len = (size_t)event_data->len;
    memcpy(payload, event_data->data, copy_len);
    payload[copy_len] = '\0';

    printf("ComBrief BLE host write length=%u flag=%u\n", (unsigned int)copy_len, (unsigned int)event_data->flag);

    if ((uint16_t)event_data->char_handle == control_value_handle) {
        if (!ble_service_handle_fast_status_write(payload)) {
            event_data->len = -ATT_ERR_UNLIKELY;
            return;
        }
        event_data->len = (int32_t)copy_len;
        return;
    }

    if (!ble_service_handle_host_write(payload)) {
        event_data->len = -ATT_ERR_UNLIKELY;
        return;
    }

    event_data->len = (int32_t)copy_len;
}

static void handle_gatt_ccc_change(const evt_data_gatt_char_ccc_change_t *event_data)
{
    uint16_t ccc_handle;

    if (event_data == NULL || g_service_handle < 0) {
        return;
    }

    ccc_handle = (uint16_t)(g_service_handle + COMBRIEF_GATT_IDX_DEVICE_TX_CCC);
    if ((uint16_t)event_data->char_handle == ccc_handle) {
        ble_service_on_notify_enabled(event_data->ccc_value == CCC_VALUE_NOTIFY);
        printf("ComBrief BLE notify %s\n", g_notify_enabled ? "enabled" : "disabled");
    }
}

static int ble_event_callback(ble_event_en event, void *event_data)
{
    switch (event) {
    case EVENT_GAP_CONN_CHANGE:
        handle_gap_connection_change((const evt_data_gap_conn_change_t *)event_data);
        break;
    case EVENT_GATT_CHAR_WRITE:
        handle_gatt_write((evt_data_gatt_char_write_t *)event_data);
        break;
    case EVENT_GATT_CHAR_CCC_CHANGE:
        handle_gatt_ccc_change((const evt_data_gatt_char_ccc_change_t *)event_data);
        break;
    case EVENT_GAP_ADV_TIMEOUT:
        g_advertising = false;
        ble_service_start_advertising();
        break;
    default:
        break;
    }

    return 0;
}

static ble_event_cb_t g_ble_callback = {
    .callback = ble_event_callback,
};

static bool init_haas_ble_stack(void)
{
    int ret;
    init_param_t init = {
        .dev_name = NULL,
        .dev_addr = NULL,
        .conn_num_max = 1,
    };

    if (g_stack_ready) {
        return true;
    }

    hci_h4_driver_init();
    ret = ble_stack_init(&init);
    if (ret != 0 && ret != -BLE_STACK_ERR_ALREADY) {
        printf("ComBrief BLE stack init failed ret=%d\n", ret);
        return false;
    }

    ret = ble_stack_event_register(&g_ble_callback);
    if (ret != 0 && ret != -BLE_STACK_ERR_ALREADY) {
        printf("ComBrief BLE event register failed ret=%d\n", ret);
        return false;
    }

    ret = ble_stack_set_name(g_device_name);
    if (ret != 0) {
        printf("ComBrief BLE name set failed ret=%d\n", ret);
        return false;
    }

    g_stack_ready = true;
    printf("ComBrief BLE stack ready\n");
    return true;
}

static bool register_haas_gatt_service(void)
{
    if (g_service_ready) {
        return true;
    }

    g_service_handle = ble_stack_gatt_registe_service(&g_combrief_gatt_service, g_combrief_gatt_attrs, COMBRIEF_GATT_IDX_MAX);
    if (g_service_handle < 0) {
        printf("ComBrief BLE GATT register failed ret=%d\n", g_service_handle);
        return false;
    }

    g_service_ready = true;
    printf("ComBrief BLE GATT service handle=%d\n", g_service_handle);
    return true;
}
#endif

void ble_service_init(const char *device_name, const char *service_uuid)
{
    copy_or_default(g_device_name, sizeof(g_device_name), device_name, k_combrief_ble_device_name);
    copy_or_default(g_service_uuid, sizeof(g_service_uuid), service_uuid, k_combrief_ble_service_uuid);
    g_advertising = false;
    g_connected = false;
    g_notify_enabled = false;
    g_awaiting_host_sync = false;
    g_hello_retry_ticks = 0;
    g_host_rx_len = 0;
    g_host_rx_buffer[0] = '\0';

#if COMBRIEF_HAS_HAAS_BLE
    g_conn_handle = -1;
    g_notify_enabled = false;
    if (init_haas_ble_stack()) {
        (void)register_haas_gatt_service();
    }
#endif

    printf("ComBrief BLE init name=%s service=%s host_tx=%s device_tx=%s\n",
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
#if COMBRIEF_HAS_HAAS_BLE
    uint8_t flags = AD_FLAG_GENERAL | AD_FLAG_NO_BREDR;
    ad_data_t ad[] = {
        {.type = AD_DATA_TYPE_FLAGS, .len = 1, .data = &flags},
        {.type = AD_DATA_TYPE_NAME_COMPLETE, .len = (uint8_t)strlen(g_device_name), .data = (uint8_t *)g_device_name},
    };
    adv_param_t param = {
        ADV_IND,
        ad,
        NULL,
        BLE_ARRAY_NUM(ad),
        0,
        ADV_SLOW_INT_MIN,
        ADV_SLOW_INT_MAX,
        ADV_FILTER_POLICY_ANY_REQ,
        ADV_DEFAULT_CHAN_MAP,
        {0},
    };
    int ret;

    if (!g_stack_ready || !g_service_ready) {
        if (!init_haas_ble_stack() || !register_haas_gatt_service()) {
            printf("ComBrief BLE advertising skipped stack_ready=%u service_ready=%u\n", g_stack_ready ? 1U : 0U, g_service_ready ? 1U : 0U);
            return;
        }
    }

    (void)ble_stack_adv_stop();
    ret = ble_stack_adv_start(&param);
    if (ret != 0) {
        printf("ComBrief BLE advertising failed ret=%d\n", ret);
        g_advertising = false;
        return;
    }
#endif
    g_advertising = true;
    printf("ComBrief BLE advertising %s service UUID %s\n", g_device_name, g_service_uuid);
}

void ble_service_tick(void)
{
    if (!g_connected || !g_notify_enabled || !g_awaiting_host_sync) {
        return;
    }

    g_hello_retry_ticks++;
    if (g_hello_retry_ticks < COMBRIEF_HELLO_RETRY_TICKS) {
        return;
    }

    (void)ble_service_send_hello();
}

bool combrief_ble_send_json(const char *json)
{
    size_t payload_len;

    if (json == NULL || json[0] == '\0' || !g_connected) {
        return false;
    }

    payload_len = strlen(json);
#if COMBRIEF_HAS_HAAS_BLE
    if (g_conn_handle < 0 || !g_notify_enabled || g_service_handle < 0 || payload_len > 244) {
        return false;
    }

    if (ble_stack_gatt_notificate(g_conn_handle, (uint16_t)(g_service_handle + COMBRIEF_GATT_IDX_DEVICE_TX_VAL), (const uint8_t *)json, (uint16_t)payload_len) != 0) {
        return false;
    }
#endif
    printf("ComBrief BLE notify characteristic=%s length=%u\n",
        k_combrief_ble_device_tx_uuid,
        (unsigned int)payload_len);
    return true;
}

bool ble_service_send_json(const char *json)
{
    return combrief_ble_send_json(json);
}

bool ble_service_handle_fast_status_write(const char *payload)
{
    combrief_app_state_t *state = combrief_app_state_get_mutable();
    const char *status;
    const char *label;
    char status_buf[24];
    char label_buf[24];
    size_t status_len;

    if (payload == NULL || state == NULL || strncmp(payload, "S:", 2) != 0) {
        return false;
    }

    status = strchr(payload + 2, ':');
    if (status == NULL) {
        return false;
    }
    status++;
    label = strchr(status, ':');
    if (label == NULL) {
        return false;
    }

    status_len = (size_t)(label - status);
    if (status_len == 0 || status_len >= sizeof(status_buf)) {
        return false;
    }
    memcpy(status_buf, status, status_len);
    status_buf[status_len] = '\0';
    label++;
    if (label[0] == '\0') {
        return false;
    }
    (void)snprintf(label_buf, sizeof(label_buf), "%s", label);

    combrief_app_state_apply_fast_status(state, label_buf, status_buf);
    printf("ComBrief BLE fast status characteristic=%s status=%s label=%s\n",
        k_combrief_ble_control_uuid,
        status_buf,
        label_buf);
    return true;
}

bool ble_service_handle_host_write(const char *json)
{
    combrief_app_state_t *state = combrief_app_state_get_mutable();
    const char *payload = json;
    size_t payload_len;
    bool final_chunk = true;
    char host_message_id[96];
    bool has_host_message_id;

    if (json == NULL || state == NULL) {
        return false;
    }

    if (json[0] == '>' || json[0] == '!') {
        final_chunk = json[0] == '!';
        payload = json + 1;
        payload_len = strlen(payload);
        if (payload[0] == '{') {
            g_host_rx_len = 0;
            g_host_rx_buffer[0] = '\0';
        }
        if (g_host_rx_len + payload_len >= sizeof(g_host_rx_buffer)) {
            g_host_rx_len = 0;
            g_host_rx_buffer[0] = '\0';
            return false;
        }
        memcpy(&g_host_rx_buffer[g_host_rx_len], payload, payload_len);
        g_host_rx_len += payload_len;
        g_host_rx_buffer[g_host_rx_len] = '\0';
        printf("ComBrief BLE host chunk characteristic=%s length=%u final=%u total=%u\n",
            k_combrief_ble_host_tx_uuid,
            (unsigned int)payload_len,
            final_chunk ? 1U : 0U,
            (unsigned int)g_host_rx_len);
        if (!final_chunk) {
            return true;
        }
        payload = g_host_rx_buffer;
    } else {
        g_host_rx_len = 0;
        g_host_rx_buffer[0] = '\0';
        payload_len = strlen(payload);
    }

    payload_len = strlen(payload);
    printf("ComBrief BLE host write characteristic=%s length=%u\n",
        k_combrief_ble_host_tx_uuid,
        (unsigned int)payload_len);
    has_host_message_id = ble_service_extract_host_message_id(payload, host_message_id, sizeof(host_message_id));
    if (!combrief_protocol_apply_host_message(state, payload)) {
        if (has_host_message_id) {
            (void)ble_service_send_host_ack(host_message_id, false, "apply failed");
        }
        g_host_rx_len = 0;
        g_host_rx_buffer[0] = '\0';
        return false;
    }

    if (has_host_message_id) {
        (void)ble_service_send_host_ack(host_message_id, true, NULL);
    }

    g_awaiting_host_sync = false;
    g_host_rx_len = 0;
    g_host_rx_buffer[0] = '\0';
    return true;
}

void ble_service_on_connected(void)
{
    combrief_app_state_t *state = combrief_app_state_get_mutable();

    g_connected = true;
    g_advertising = false;
    g_awaiting_host_sync = true;
    g_hello_retry_ticks = COMBRIEF_HELLO_RETRY_TICKS;
    combrief_app_state_set_ble_connected(state, true);
}

void ble_service_on_disconnected(void)
{
    g_connected = false;
    g_notify_enabled = false;
    g_awaiting_host_sync = false;
    g_hello_retry_ticks = 0;
    g_host_rx_len = 0;
    g_host_rx_buffer[0] = '\0';
    combrief_app_state_set_ble_connected(combrief_app_state_get_mutable(), false);
    ble_service_start_advertising();
}
