$offset = 0
$limit = 50
$baseUrl = "https://itylpvuzflqlmmqvdhbz.supabase.co/functions/v1/sync-prices"

while ($true) {
    Write-Host "Procesando offset $offset..."
    $url = "$baseUrl`?limit=$limit&offset=$offset"
    try {
        $response = Invoke-RestMethod -Uri $url -Method Post -TimeoutSec 120
        $count = $response.count
        $procesados = $response.procesados
        Write-Host "Completado: $procesados precios guardados de $count productos obtenidos."
        
        if ($count -lt $limit) {
            Write-Host "FIN. Se completó todo el catálogo."
            break
        }
        $offset += $limit
    } catch {
        Write-Host "Error en offset $offset. Reintentando en 2 segundos..."
        Start-Sleep -Seconds 2
    }
}
