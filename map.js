document.addEventListener('DOMContentLoaded', function () {
    // --- Initialize Map ---
    const map = L.map('map').setView([20, 0], 2);

    // --- Add Tile Layer (Base Map) ---
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // --- Global variables & Constants ---
    let geojsonData = null;
    let deathsData = null;
    let geojsonLayer = null;
    const years = Array.from({ length: 2019 - 1990 + 1 }, (_, i) => 1990 + i);
    let selectedYear = parseInt(document.getElementById('year-slider').value) || years[0];
    let selectedDisease = null;
    let currentMaxValue = 1;

    // DOM Elements
    const diseaseSelector = document.getElementById('disease-selector');
    const yearSlider = document.getElementById('year-slider');
    const yearDisplay = document.getElementById('year-display');

    // ====================================================================
    // === RENK ÖLÇEĞİNİ BURADAN DÜZENLEYEBİLİRSİNİZ ===
    // Renkler genellikle en açıktan en koyuya doğru sıralanır.
    // ColorBrewer gibi sitelerden hazır paletler bulabilirsiniz (örn: YlOrRd, Reds, Blues)
    // Hex renk kodları kullanın. Dizi uzunluğu (kaç renk olduğu) ölçeğin
    // kaç adıma bölüneceğini belirler.
     // ====================================================================
    // === RENK ÖLÇEĞİNİ BURADAN DÜZENLEYEBİLİRSİNİZ ===
    // Sarıdan Kırmızıya (YlOrRd) - 27 Adım
    const COLOR_SCALE = [
        '#ffffcc', '#fffca7', '#fff986', '#fff56a', '#ffee54', '#ffe743',
        '#ffd937', '#ffcb2d', '#ffbd24', '#ffaf1b', '#fea113', '#fd920e',
        '#fd820c', '#fc7111', '#fb6014', '#f94e17', '#f53b18', '#ee2717',
        '#e61614', '#dd0a12', '#d20410', '#c70010', '#bb0013', '#ae0016',
        '#a00019', '#92001d', '#800026'
    ];
    // ====================================================================

    // --- Function to Get Color based on Value ---
    function getColor(d, maxValue) {
        if (!d || d <= 0) return '#FFFFFF'; // Veri yoksa veya 0 ise beyaz
        const scale = COLOR_SCALE; // Tanımlanan renk skalasını kullan
        const step = maxValue > 0 ? maxValue / (scale.length -1) : 1; // 0'a bölme hatasını önle
        // Değerin hangi renk aralığına düştüğünü hesapla
        const index = Math.min(Math.floor(d / step), scale.length - 1);
        return scale[index];
    }

    // --- Function to style countries ---
    function styleFeature(feature) {
        let deathValue = 0;
        if (deathsData && selectedDisease && selectedYear && feature.properties.iso_a3) {
            const countryCode = feature.properties.iso_a3;
            if (deathsData[countryCode]?.[selectedYear]?.[selectedDisease] !== undefined) {
                deathValue = deathsData[countryCode][selectedYear][selectedDisease];
            }
        }
        return {
            fillColor: getColor(deathValue, currentMaxValue),
            weight: 1,
            opacity: 1,
            color: 'grey', // Sınır rengi
            dashArray: '3',
            fillOpacity: 0.7
        };
    }

     // --- Update Legend ---
     function updateLegend(maxValue) {
        const legendColors = document.getElementById('legend-colors');
        const legendMin = document.getElementById('legend-min');
        const legendMax = document.getElementById('legend-max');
        const legendTitle = document.getElementById('legend-title');
        const scale = COLOR_SCALE; // Tanımlanan renk skalasını kullan

        // Lejant çubuğu için doğrusal gradyan oluştur
        legendColors.style.background = `linear-gradient(to right, ${scale.join(',')})`;
        legendMin.textContent = 0;

        // Maksimum değeri kısaltarak yaz (K=bin, M=milyon)
        let maxLabel;
        if (maxValue >= 1e6) { maxLabel = (maxValue / 1e6).toFixed(1) + 'M'; }
        else if (maxValue >= 1e3) { maxLabel = (maxValue / 1e3).toFixed(1) + 'K'; }
        else { maxLabel = maxValue.toFixed(0); }
        legendMax.textContent = maxLabel;

        // Lejant başlığını güncelle
        legendTitle.textContent = selectedDisease ? selectedDisease.replace(/_/g, ' ') + " (Deaths)" : "Deaths";
    }

    // --- Function to update map styles ---
    function updateMapStyles() {
        if (!geojsonLayer || !deathsData || !selectedDisease || !selectedYear) return;

        // Mevcut seçim için maksimum değeri bul (renk skalası için)
        currentMaxValue = 0;
        Object.values(deathsData).forEach(countryData => {
            if (countryData[selectedYear]?.[selectedDisease] !== undefined) {
                currentMaxValue = Math.max(currentMaxValue, countryData[selectedYear][selectedDisease]);
            }
        });
        if (currentMaxValue === 0) currentMaxValue = 1; // Eğer max 0 ise, 1 yap (bölme hatası olmasın)

        // Tüm katmanlara yeni stili uygula (her ülke için styleFeature yeniden çağrılır)
        geojsonLayer.setStyle(styleFeature);
        // Lejantı yeni maksimum değere göre güncelle
        updateLegend(currentMaxValue);
        console.log(`Map updated for Year: ${selectedYear}, Disease: ${selectedDisease}, Max Deaths: ${currentMaxValue}`);
    }

    // --- Load Data and Initialize ---
    Promise.all([
        fetch('world_countries.geojson').then(response => response.ok ? response.json() : Promise.reject(`GeoJSON Fetch Error! Status: ${response.status}`)),
        fetch('deaths_data.json').then(response => response.ok ? response.json() : Promise.reject(`JSON Fetch Error! Status: ${response.status}`))
    ])
    .then(([geojsonDataLoaded, deathsDataLoaded]) => {
        geojsonData = geojsonDataLoaded;
        deathsData = deathsDataLoaded;
        console.log("GeoJSON and Deaths data loaded successfully.");

        // --- Populate Controls ---
        diseaseSelector.innerHTML = ''; // Temizle

        // Veriden benzersiz hastalık isimlerini al
        let diseaseSet = new Set();
        Object.values(deathsData).forEach(countryData => {
            Object.values(countryData).forEach(yearData => {
                Object.keys(yearData).forEach(disease => diseaseSet.add(disease));
            });
        });
        const diseases = Array.from(diseaseSet).sort();

        // Hastalık açılır menüsünü doldur
        diseases.forEach(disease => {
            const option = document.createElement('option');
            option.value = disease;
            // Görüntü için alt çizgileri boşlukla değiştir (isteğe bağlı)
            option.textContent = disease.replace(/_/g, ' ');
            diseaseSelector.appendChild(option);
        });
        // Varsayılan hastalığı ayarla
        if (diseases.length > 0) {
            selectedDisease = diseases[0];
            diseaseSelector.value = selectedDisease;
        }

        // Slider özelliklerini ayarla
        yearSlider.min = years[0];
        yearSlider.max = years[years.length - 1];
        yearSlider.value = selectedYear;
        yearDisplay.textContent = selectedYear;

        // --- Add GeoJSON Layer ---
        geojsonLayer = L.geoJson(geojsonData, {
            style: styleFeature,
            onEachFeature: function (feature, layer) {
                layer.bindTooltip(() => {
                    let content = `<b>${feature.properties.name || 'N/A'}</b>`;
                    const countryCode = feature.properties.iso_a3;
                    if (deathsData && selectedDisease && selectedYear && countryCode) {
                         const val = deathsData[countryCode]?.[selectedYear]?.[selectedDisease];
                         content += `<br>Year: ${selectedYear}`;
                         content += `<br>${selectedDisease.replace(/_/g, ' ')}: ${val !== undefined ? val.toLocaleString() : 'No data'}`;
                    }
                    return content;
                });
            }
        }).addTo(map);
        console.log("GeoJSON layer added to map.");

        // --- Setup Control Listeners ---
        // Hastalık seçimi değiştiğinde haritayı güncelle
        diseaseSelector.addEventListener('change', function() {
            selectedDisease = this.value;
            updateMapStyles();
        });

        // Yıl kaydırıcısı hareket ettikçe (input olayı ile anlık güncelleme)
        yearSlider.addEventListener('input', function() {
            selectedYear = parseInt(this.value);
            yearDisplay.textContent = selectedYear; // Yıl göstergesini güncelle
            updateMapStyles(); // Harita stillerini güncelle
        });

        // --- Initial Map Styling ---
        // Sayfa yüklendiğinde haritayı ilk değerlere göre stillendir
        updateMapStyles();

    })
    .catch(error => {
        console.error('Error loading or processing data:', error);
        // Kullanıcıya daha anlaşılır bir mesaj göster
        alert('Harita verileri yüklenirken bir hata oluştu. Lütfen dosyaların doğru yerde olduğundan ve konsolu (F12) kontrol ettiğinizden emin olun.');
    });
});