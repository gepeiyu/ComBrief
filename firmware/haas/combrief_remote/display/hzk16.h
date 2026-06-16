#ifndef COMBRIEF_HZK16_H
#define COMBRIEF_HZK16_H

#include <stdint.h>

#define COMBRIEF_HZK_FONT_SIZE 12
#define COMBRIEF_HZK_HEIGHT COMBRIEF_HZK_FONT_SIZE
#define COMBRIEF_HZK_ASCII_WIDTH (COMBRIEF_HZK_FONT_SIZE / 2)

int hzk16_init(void);

uint8_t hzk16_draw_utf8_line(uint8_t x, uint8_t y, const char *text, uint8_t mode);

#endif
