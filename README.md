
# Home Assistant - SA CFS Fire Danger

Home Assistant Custom Integration to pull SA CFS Fire Danger Ratings and Fire Ban information.

If you're here, you've probably been sent the link to test for me, or you're very very lost.

Install as a custom repository in HACS, and the config flow will let you select which regions you want to monitor.

By default this integration will create a sensor called ***sensor.sa_cfs_fire_danger***, with the state of the last update (in hh:mm dd/mm/yyyy format), and the following attributes (with examples in italic):

- icon: mdi:fire-alert
- friendly_name: SA CFS Fire Danger
- region_count: 15

These attributes were used in testing custom flex-table-card, not sure if they will stay:

- day_1_name: *Saturday*
- day_1_date: *04/10*
- day_2_name: *Sunday*
- day_2_date: *05/10*
- day_3_name: *Monday*
- day_3_date: *06/10*
- day_4_name: *Tuesday*
- day_4_date: *07/10*
- day_5_name: *Wednesday*
- day_5_date: *08/10*

It then creates three attributes for each of the 15 CFS Fire Danger regions:
- adelaide_metropolitan_rating: *No Rating*
- adelaide_metropolitan_fbi: *0*
- adelaide_metropolitan_fireban: *No*

During the config flow, you can select none, or any number of specific regions to monitor, this will then create a new sensor ***sensor.sa_cfs_REGIONNAME*** with the state as the current Fire Danger Rating, and the following attributes:
- region_name: *Flinders*
- day_1_rating: *Moderate*
- day_1_fbi: *15*
- day_1_fireban: *No*
- day_1_day_name: *Saturday*
- day_1_date: *04/10*
- day_2_rating: *Moderate*
- day_2_fbi: *20*
- day_2_fireban: *No*
- day_2_day_name: *Sunday*
- day_2_date: *05/10*
- day_3_rating: *No Rating*
- day_3_fbi: *10*
- day_3_fireban: *No*
- day_3_day_name: *Monday*
- day_3_date: *06/10*
- day_4_rating: *No Rating*
- day_4_fbi: *8*
- day_4_fireban: *No*
- day_4_day_name: *Tuesday*
- day_4_date: *07/10*
- day_5_rating: *No Rating*
- day_5_fbi: *10*
- day_5_fireban: *No*
- day_5_day_name: *Wednesday*
- day_5_date: *08/10*
- icon: *mdi:map-marker-alert-outline*
- friendly_name: *SA CFS Flinders*
