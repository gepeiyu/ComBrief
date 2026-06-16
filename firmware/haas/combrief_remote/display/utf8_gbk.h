#ifndef COMBRIEF_UTF8_GBK_H
#define COMBRIEF_UTF8_GBK_H

#include <stdint.h>

#define COMBRIEF_UTF8_TO_GBK 0x2

uint32_t combrief_string_convert(uint8_t *dst_str, uint32_t max_dst_len,
                                 uint8_t *src_str, uint32_t src_len, uint32_t type);

static inline uint32_t combrief_utf8_to_gbk(uint8_t *dst, uint32_t dst_len,
                                            const char *src, uint32_t src_len)
{
    return combrief_string_convert(dst, dst_len, (uint8_t *)src, src_len, COMBRIEF_UTF8_TO_GBK);
}

#endif
