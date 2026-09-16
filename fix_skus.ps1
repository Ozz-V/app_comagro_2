$url = "https://itylpvuzflqlmmqvdhbz.supabase.co/rest/v1/productos_ai_data?sku=eq.WA81802-52"
$headers = @{
    "apikey" = $env:EXPO_PUBLIC_SUPABASE_ANON_KEY
    "Authorization" = "Bearer $($env:EXPO_PUBLIC_SUPABASE_ANON_KEY)"
    "Content-Type" = "application/json"
}
Invoke-RestMethod -Uri $url -Method Patch -Headers $headers -Body '{"precio_web": 6900}'
Invoke-RestMethod -Uri "https://itylpvuzflqlmmqvdhbz.supabase.co/rest/v1/productos_ai_data?sku=eq.WA81802-48" -Method Patch -Headers $headers -Body '{"precio_web": 7409900}'
