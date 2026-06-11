#ifndef COMBRIEF_POWER_H
#define COMBRIEF_POWER_H

#ifdef __cplusplus
extern "C" {
#endif

void power_init(void);
void power_tick(void);
unsigned int power_get_battery_percent(void);

#ifdef __cplusplus
}
#endif

#endif
