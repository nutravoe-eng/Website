-- Align Domlur kitchen coordinates with app hub in lib/delivery.ts (routing / pricing).

update public.delivery_hubs
set
  lat = 12.956234989984159,
  lng = 77.63834643721881
where slug = 'domlur';
