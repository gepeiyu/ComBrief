#include "hzk16.h"

#include <errno.h>
#include <fcntl.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

#include "sh1106.h"
#include "utf8_gbk.h"

#if COMBRIEF_HZK_FONT_SIZE == 12
#define HZK_FONT_PATH   "/data/font/HZK12"
#define HZK_GLYPH_BYTES 24
#elif COMBRIEF_HZK_FONT_SIZE == 16
#define HZK_FONT_PATH   "/data/font/HZK16"
#define HZK_GLYPH_BYTES 32
#else
#error "Unsupported COMBRIEF_HZK_FONT_SIZE"
#endif

#define HZK_GBK_BUF_LEN 128

static int g_hzk_fd = -1;

int hzk16_init(void)
{
    if (g_hzk_fd >= 0) {
        return 0;
    }

    g_hzk_fd = open(HZK_FONT_PATH, O_RDONLY);
    if (g_hzk_fd < 0) {
        printf("ComBrief HZK%u open failed path=%s errno=%d\n",
               (unsigned int)COMBRIEF_HZK_FONT_SIZE,
               HZK_FONT_PATH,
               errno);
        return -1;
    }

    printf("ComBrief HZK%u ready\n", (unsigned int)COMBRIEF_HZK_FONT_SIZE);
    return 0;
}

static bool hzk_glyph_offset(uint8_t hi, uint8_t lo, uint32_t *offset)
{
    if (hi < 0xA1 || hi > 0xFE || lo < 0xA1 || lo > 0xFE) {
        return false;
    }

    *offset = ((uint32_t)(hi - 0xA1) * 94u + (uint32_t)(lo - 0xA1)) * HZK_GLYPH_BYTES;
    return true;
}

static void hzk_draw_glyph(uint8_t x, uint8_t y, const uint8_t *glyph, uint8_t mode)
{
    uint8_t row;

    for (row = 0; row < COMBRIEF_HZK_HEIGHT; row++) {
        uint16_t bits = ((uint16_t)glyph[row * 2] << 8) | glyph[row * 2 + 1];
        uint8_t col;

        for (col = 0; col < COMBRIEF_HZK_HEIGHT; col++) {
            if (bits & (0x8000u >> col)) {
                OLED_DrawPoint((int16_t)(x + row), (int16_t)(y + col), mode);
            }
        }
    }
}

static bool hzk_draw_gbk_pair(uint8_t *x, uint8_t y, uint8_t hi, uint8_t lo, uint8_t mode)
{
    uint32_t offset;
    uint8_t glyph[HZK_GLYPH_BYTES];

    if (g_hzk_fd < 0 || *x > (131 - COMBRIEF_HZK_HEIGHT)) {
        return false;
    }
    if (!hzk_glyph_offset(hi, lo, &offset)) {
        return false;
    }
    if (lseek(g_hzk_fd, (off_t)offset, SEEK_SET) < 0) {
        return false;
    }
    if (read(g_hzk_fd, glyph, HZK_GLYPH_BYTES) != HZK_GLYPH_BYTES) {
        return false;
    }

    hzk_draw_glyph(*x, y, glyph, mode);
    *x = (uint8_t)(*x + COMBRIEF_HZK_HEIGHT);
    return true;
}

static uint8_t hzk_draw_gbk_buffer(uint8_t x, uint8_t y, const uint8_t *gbk, uint32_t gbk_len, uint8_t mode)
{
    uint32_t index = 0;

    while (index < gbk_len) {
        uint8_t byte = gbk[index];

        if (byte < 0x80) {
            if (byte < 0x20 || x > (131 - COMBRIEF_HZK_ASCII_WIDTH)) {
                index++;
                continue;
            }
            OLED_Show_Char(x, y, byte, COMBRIEF_HZK_FONT_SIZE, mode);
            x = (uint8_t)(x + COMBRIEF_HZK_ASCII_WIDTH);
            index++;
            continue;
        }

        if (index + 1 >= gbk_len) {
            break;
        }

        (void)hzk_draw_gbk_pair(&x, y, gbk[index], gbk[index + 1], mode);
        index += 2;
    }

    return x;
}

uint8_t hzk16_draw_utf8_line(uint8_t x, uint8_t y, const char *text, uint8_t mode)
{
    uint8_t gbk[HZK_GBK_BUF_LEN];
    uint32_t gbk_len;

    if (text == NULL || text[0] == '\0') {
        return x;
    }

    if (g_hzk_fd < 0) {
        (void)hzk16_init();
    }
    if (g_hzk_fd < 0) {
        return x;
    }

    gbk_len = combrief_utf8_to_gbk(gbk, sizeof(gbk), text, (uint32_t)strlen(text));
    if (gbk_len == 0) {
        return x;
    }

    return hzk_draw_gbk_buffer(x, y, gbk, gbk_len, mode);
}
