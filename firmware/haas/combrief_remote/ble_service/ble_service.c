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
#define COMBRIEF_BLE_NOTIFY_SINGLE_MAX_LEN 20
#define COMBRIEF_BLE_NOTIFY_CHUNK_PAYLOAD_LEN 19
#define COMBRIEF_BLE_HOST_RX_BUFFER_LEN 2048
#define COMBRIEF_BLE_HOST_V2_HEADER_LEN 7
#define COMBRIEF_BLE_HOST_V2_PAYLOAD_LEN 13
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
static char g_host_rx_buffer[COMBRIEF_BLE_HOST_RX_BUFFER_LEN];
static size_t g_host_rx_len;
static uint8_t g_host_rx_seq;
static uint8_t g_host_rx_total_parts;
static uint8_t g_host_rx_next_part;
static bool g_advertising;
static bool g_connected;
static bool g_notify_enabled;
static bool g_awaiting_host_sync;
static uint8_t g_hello_retry_ticks;
static char g_fast_status_labels[COMBRIEF_MAX_TRACKED_APPS][24];
static uint8_t g_fast_status_seq[COMBRIEF_MAX_TRACKED_APPS];
static bool g_fast_status_seq_known[COMBRIEF_MAX_TRACKED_APPS];

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

static bool fast_status_seq_is_newer(uint8_t seq, uint8_t previous)
{
    return seq != previous && (uint8_t)(seq - previous) < 128U;
}

static bool ble_service_accept_fast_status_seq(const char *label, uint8_t seq)
{
    uint8_t i;
    uint8_t empty_slot = COMBRIEF_MAX_TRACKED_APPS;

    if (label == NULL || label[0] == '\0') {
        return false;
    }

    for (i = 0; i < COMBRIEF_MAX_TRACKED_APPS; i++) {
        if (g_fast_status_seq_known[i] && strcmp(g_fast_status_labels[i], label) == 0) {
            if (!fast_status_seq_is_newer(seq, g_fast_status_seq[i])) {
                return false;
            }
            g_fast_status_seq[i] = seq;
            return true;
        }
        if (!g_fast_status_seq_known[i] && empty_slot == COMBRIEF_MAX_TRACKED_APPS) {
            empty_slot = i;
        }
    }

    if (empty_slot == COMBRIEF_MAX_TRACKED_APPS) {
        empty_slot = COMBRIEF_MAX_TRACKED_APPS - 1;
    }
    copy_or_default(g_fast_status_labels[empty_slot], sizeof(g_fast_status_labels[empty_slot]), label, "CB");
    g_fast_status_seq[empty_slot] = seq;
    g_fast_status_seq_known[empty_slot] = true;
    return true;
}

static void ble_service_reset_fast_status_seq(void)
{
    memset(g_fast_status_labels, 0, sizeof(g_fast_status_labels));
    memset(g_fast_status_seq, 0, sizeof(g_fast_status_seq));
    memset(g_fast_status_seq_known, 0, sizeof(g_fast_status_seq_known));
}

static uint8_t ble_service_hex_nibble(char value)
{
    if (value >= '0' && value <= '9') {
        return (uint8_t)(value - '0');
    }
    if (value >= 'A' && value <= 'F') {
        return (uint8_t)(value - 'A' + 10);
    }
    if (value >= 'a' && value <= 'f') {
        return (uint8_t)(value - 'a' + 10);
    }
    return 0xFF;
}

static bool ble_service_parse_hex_byte(const char *text, uint8_t *out)
{
    uint8_t high;
    uint8_t low;

    if (text == NULL || out == NULL) {
        return false;
    }
    high = ble_service_hex_nibble(text[0]);
    low = ble_service_hex_nibble(text[1]);
    if (high == 0xFF || low == 0xFF) {
        return false;
    }
    *out = (uint8_t)((high << 4) | low);
    return true;
}

static void ble_service_reset_host_rx(void)
{
    g_host_rx_len = 0;
    g_host_rx_buffer[0] = '\0';
    g_host_rx_seq = 0;
    g_host_rx_total_parts = 0;
    g_host_rx_next_part = 0;
}

static bool ble_service_parse_fast_status_seq(const char *text, uint8_t *out)
{
    uint8_t value;

    if (text == NULL || out == NULL) {
        return false;
    }
    value = ble_service_hex_nibble(text[0]);
    if (value == 0xFF) {
        return false;
    }
    if (text[1] == ':') {
        *out = value;
        return true;
    }
    if (text[1] != '\0' && text[2] == ':') {
        uint8_t low = ble_service_hex_nibble(text[1]);
        if (low == 0xFF) {
            return false;
        }
        *out = (uint8_t)((value << 4) | low);
        return true;
    }
    return false;
}

static bool ble_service_handle_v2_host_chunk(const char *json, const char **payload_out)
{
    uint8_t seq;
    uint8_t part_index;
    uint8_t total_parts;
    const char *payload;
    size_t payload_len;

    if (json == NULL || payload_out == NULL || strlen(json) < COMBRIEF_BLE_HOST_V2_HEADER_LEN) {
        ble_service_reset_host_rx();
        return false;
    }
    if (!ble_service_parse_hex_byte(json + 1, &seq) ||
        !ble_service_parse_hex_byte(json + 3, &part_index) ||
        !ble_service_parse_hex_byte(json + 5, &total_parts) || total_parts == 0) {
        ble_service_reset_host_rx();
        return false;
    }
    if (part_index >= total_parts) {
        ble_service_reset_host_rx();
        return false;
    }

    payload = json + COMBRIEF_BLE_HOST_V2_HEADER_LEN;
    payload_len = strlen(payload);
    if (payload_len > COMBRIEF_BLE_HOST_V2_PAYLOAD_LEN) {
        ble_service_reset_host_rx();
        return false;
    }

    if (part_index == 0) {
        ble_service_reset_host_rx();
        g_host_rx_seq = seq;
        g_host_rx_total_parts = total_parts;
    } else if (seq != g_host_rx_seq || total_parts != g_host_rx_total_parts || part_index != g_host_rx_next_part) {
        ble_service_reset_host_rx();
        return false;
    }

    if (g_host_rx_len + payload_len >= sizeof(g_host_rx_buffer)) {
        ble_service_reset_host_rx();
        return false;
    }
    memcpy(&g_host_rx_buffer[g_host_rx_len], payload, payload_len);
    g_host_rx_len += payload_len;
    g_host_rx_buffer[g_host_rx_len] = '\0';
    g_host_rx_next_part = (uint8_t)(part_index + 1);

    printf("ComBrief BLE host v2 chunk characteristic=%s seq=%u part=%u total_parts=%u length=%u total=%u\n",
        k_combrief_ble_host_tx_uuid,
        (unsigned int)seq,
        (unsigned int)part_index,
        (unsigned int)total_parts,
        (unsigned int)payload_len,
        (unsigned int)g_host_rx_len);

    if (part_index + 1U < total_parts) {
        *payload_out = NULL;
        return true;
    }

    *payload_out = g_host_rx_buffer;
    return true;
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
    ble_service_reset_host_rx();
    ble_service_reset_fast_status_seq();

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

#if COMBRIEF_HAS_HAAS_BLE
static bool ble_service_notify_bytes(const uint8_t *bytes, size_t len)
{
    if (bytes == NULL || len == 0) {
        printf("ComBrief BLE notify skipped: empty payload\n");
        return false;
    }
    if (!g_connected) {
        printf("ComBrief BLE notify skipped: disconnected\n");
        return false;
    }
    if (g_conn_handle < 0 || g_service_handle < 0 || len > COMBRIEF_BLE_NOTIFY_SINGLE_MAX_LEN) {
        printf("ComBrief BLE notify skipped conn=%d notify=%u service=%d length=%u\n",
            (int)g_conn_handle,
            g_notify_enabled ? 1U : 0U,
            (int)g_service_handle,
            (unsigned int)len);
        return false;
    }
    if (ble_stack_gatt_notificate(g_conn_handle, (uint16_t)(g_service_handle + COMBRIEF_GATT_IDX_DEVICE_TX_VAL), bytes, (uint16_t)len) != 0) {
        printf("ComBrief BLE notify failed notify=%u length=%u\n",
            g_notify_enabled ? 1U : 0U,
            (unsigned int)len);
        return false;
    }
    return true;
}
#endif

bool combrief_ble_send_json(const char *json)
{
    size_t payload_len;

    if (json == NULL || json[0] == '\0') {
        printf("ComBrief BLE notify skipped: empty payload\n");
        return false;
    }
    if (!g_connected) {
        printf("ComBrief BLE notify skipped: disconnected\n");
        return false;
    }

    payload_len = strlen(json);
#if COMBRIEF_HAS_HAAS_BLE
    if (payload_len + 1 > COMBRIEF_BLE_TX_BUFFER_LEN) {
        printf("ComBrief BLE notify skipped: payload too large length=%u\n", (unsigned int)payload_len);
        return false;
    }

    if (payload_len <= COMBRIEF_BLE_NOTIFY_SINGLE_MAX_LEN) {
        if (!ble_service_notify_bytes((const uint8_t *)json, payload_len)) {
            return false;
        }
    } else {
        size_t offset = 0;
        while (offset < payload_len) {
            uint8_t chunk[COMBRIEF_BLE_NOTIFY_SINGLE_MAX_LEN];
            size_t part = payload_len - offset;
            if (part > COMBRIEF_BLE_NOTIFY_CHUNK_PAYLOAD_LEN) {
                part = COMBRIEF_BLE_NOTIFY_CHUNK_PAYLOAD_LEN;
            }
            chunk[0] = offset + part >= payload_len ? '!' : '>';
            memcpy(chunk + 1, json + offset, part);
            if (!ble_service_notify_bytes(chunk, part + 1)) {
                return false;
            }
            offset += part;
        }
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
    uint8_t seq;

    if (payload == NULL || state == NULL || strncmp(payload, "S:", 2) != 0) {
        return false;
    }

    if (!ble_service_parse_fast_status_seq(payload + 2, &seq)) {
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
    if (!ble_service_accept_fast_status_seq(label_buf, seq)) {
        printf("ComBrief BLE fast status stale characteristic=%s seq=%u status=%s label=%s\n",
            k_combrief_ble_control_uuid,
            (unsigned int)seq,
            status_buf,
            label_buf);
        return false;
    }

    combrief_app_state_apply_fast_status(state, label_buf, status_buf);
    printf("ComBrief BLE fast status characteristic=%s seq=%u status=%s label=%s\n",
        k_combrief_ble_control_uuid,
        (unsigned int)seq,
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

    if (json[0] == '@') {
        if (!ble_service_handle_v2_host_chunk(json, &payload)) {
            return false;
        }
        if (payload == NULL) {
            return true;
        }
    } else if (json[0] == '>' || json[0] == '!') {
        final_chunk = json[0] == '!';
        payload = json + 1;
        payload_len = strlen(payload);
        if (payload[0] == '{') {
            ble_service_reset_host_rx();
        }
        if (g_host_rx_len + payload_len >= sizeof(g_host_rx_buffer)) {
            ble_service_reset_host_rx();
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
        ble_service_reset_host_rx();
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
        ble_service_reset_host_rx();
        return false;
    }

    if (has_host_message_id) {
        (void)ble_service_send_host_ack(host_message_id, true, NULL);
    }

    g_awaiting_host_sync = false;
    ble_service_reset_host_rx();
    return true;
}

void ble_service_on_connected(void)
{
    combrief_app_state_t *state = combrief_app_state_get_mutable();

    g_connected = true;
    g_advertising = false;
    g_awaiting_host_sync = true;
    g_hello_retry_ticks = COMBRIEF_HELLO_RETRY_TICKS;
    ble_service_reset_fast_status_seq();
    combrief_app_state_set_ble_connected(state, true);
}

void ble_service_on_disconnected(void)
{
    g_connected = false;
    g_notify_enabled = false;
    g_awaiting_host_sync = false;
    g_hello_retry_ticks = 0;
    ble_service_reset_host_rx();
    ble_service_reset_fast_status_seq();
    combrief_app_state_set_ble_connected(combrief_app_state_get_mutable(), false);
    ble_service_start_advertising();
}
