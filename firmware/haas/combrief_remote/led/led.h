#ifndef COMBRIEF_LED_H
#define COMBRIEF_LED_H

#ifdef __cplusplus
extern "C" {
#endif

void led_init(void);
void led_tick(void);
void led_render(void);

#ifdef __cplusplus
}
#endif

#endif
