// global state
let currentRecipe = null;

// DOM Elements
const imageInput = document.getElementById('imageInput');
const dropZone = document.getElementById('dropZone');
const imagePreview = document.getElementById('imagePreview');
const dropContent = document.getElementById('dropContent');
const analyzeBtn = document.getElementById('analyzeBtn');
const languageSelect = document.getElementById('languageSelect');
const loadingState = document.getElementById('loadingState');
const errorMsg = document.getElementById('errorMsg');
const uploadSection = document.getElementById('uploadSection');
const resultsSection = document.getElementById('resultsSection');

// Events
dropZone.addEventListener('click', () => imageInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelection(e.dataTransfer.files[0]);
    }
});
imageInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        handleFileSelection(e.target.files[0]);
    }
});

let selectedFile = null;

function handleFileSelection(file) {
    if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file.');
        return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreview.style.display = 'block';
        dropContent.style.display = 'none';
        document.getElementById('generationOptions').classList.remove('hidden');
        analyzeBtn.disabled = false;
        errorMsg.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

analyzeBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    
    // Prepare API call
    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('language', languageSelect.value);
    formData.append('adults', document.getElementById('numAdults').value || 1);
    formData.append('kids', document.getElementById('numKids').value || 0);

    await fetchRecipe('analyze-dish', { method: 'POST', body: formData });
});

async function fetchRecipe(endpoint, options) {
    try {
        setLoading(true);
        errorMsg.classList.add('hidden');
        resultsSection.classList.add('hidden');
        uploadSection.style.display = 'none'; // hide upload partially or completely? Let's hide completely.

        const res = await fetch(`/api/${endpoint}`, options);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Server error occurred');
        }

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        currentRecipe = data;
        renderRecipe();

    } catch (err) {
        showError(err.message);
        uploadSection.style.display = 'block';
    } finally {
        setLoading(false);
    }
}

// Submits text generation for similar recipes
window.generateFromText = async function(dishName) {
    await fetchRecipe('generate-recipe-from-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            dishName: dishName, 
            language: languageSelect.value,
            adults: document.getElementById('numAdults').value || 1,
            kids: document.getElementById('numKids').value || 0
        })
    });
}

function renderRecipe() {
    resultsSection.classList.remove('hidden');
    uploadSection.style.display = 'block'; // Show upload section again but keep it above

    applyUITranslations();

    // Header Info
    document.getElementById('dishNameDisplay').textContent = currentRecipe.dishName;
    document.getElementById('servesCount').textContent = currentRecipe.serves || 'N/A';
    document.getElementById('cuisineOrigin').textContent = currentRecipe.cuisineOrigin || '';
    document.getElementById('prepTime').textContent = currentRecipe.prepTime || 'N/A';
    document.getElementById('cookTime').textContent = currentRecipe.cookTime || 'N/A';
    document.getElementById('cuisineSpecialty').textContent = currentRecipe.cuisineSpecialty || '';

    // Render Lists
    renderIngredients();
    
    const instrList = document.getElementById('instructionsList');
    instrList.innerHTML = '';
    (currentRecipe.instructions || []).forEach(step => {
        const li = document.createElement('li');
        li.textContent = step;
        instrList.appendChild(li);
    });

    const simList = document.getElementById('similarRecipesCarousel');
    simList.innerHTML = '';
    const t = uiTranslations[languageSelect.value] || uiTranslations['English'];
    (currentRecipe.similarRecipes || []).forEach(sim => {
        const el = document.createElement('div');
        el.className = 'similar-card';
        el.innerHTML = `
            <img src="${sim.image}" alt="${sim.name}" onerror="this.onerror=null; this.src='https://image.pollinations.ai/prompt/${encodeURIComponent(sim.name + ' delicious food plate')}?width=300&height=200&nologo=true'">
            <div class="card-body">
                <h4>${sim.name}</h4>
                <p>${sim.description}</p>
                <button onclick="generateFromText('${sim.name}')">${t.gen}</button>
            </div>
        `;
        simList.appendChild(el);
    });

    // Auto-scroll to results for a seamless UX
    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function renderIngredients() {
    const list = document.getElementById('ingredientsList');
    list.innerHTML = '';
    const t = uiTranslations[languageSelect.value] || uiTranslations['English'];
    (currentRecipe.ingredients || []).forEach((ing, index) => {
        const qty = ing.quantity || 'N/A';
        
        let subHtml = '';
        if (ing.substitute && ing.substitute.name && ing.substitute.name !== 'null' && ing.substitute.name !== '') {
            subHtml = `
                <div class="ingredient-back hidden" id="sub-${index}">
                    <p class="name">${ing.substitute.name}</p>
                    <p class="qty text-xs">${ing.substitute.reason}</p>
                    <button class="text-xs toggle-sub-btn mt-2" onclick="toggleSub(${index})"><i class="fa-solid fa-rotate-left"></i> ${t.revert}</button>
                </div>
            `;
        }

        const el = document.createElement('div');
        el.className = 'ingredient-card-container';
        el.innerHTML = `
            <div class="ingredient-card" id="front-${index}">
                <img src="${ing.image}" alt="${ing.name}" onerror="this.onerror=null; this.src='https://image.pollinations.ai/prompt/${encodeURIComponent(ing.name + ' ingredient macro photography')}?width=100&height=100&nologo=true'">
                <p class="name">${ing.name}</p>
                <p class="qty">${qty}</p>
                ${subHtml ? `<button class="text-xs toggle-sub-btn mt-2" onclick="toggleSub(${index})"><i class="fa-solid fa-arrow-right-arrow-left"></i> ${t.swap}</button>` : ''}
            </div>
            ${subHtml}
        `;
        list.appendChild(el);
    });
}

window.toggleSub = function(index) {
    const front = document.getElementById(`front-${index}`);
    const back = document.getElementById(`sub-${index}`);
    if (front.classList.contains('hidden')) {
        front.classList.remove('hidden');
        back.classList.add('hidden');
    } else {
        front.classList.add('hidden');
        back.classList.remove('hidden');
    }
}

let loadingInterval;
const loadingTexts = ["Preparing the kitchen...", "Analyzing flavors...", "Chopping veggies...", "Preheating the oven...", "Plating your dish...", "Almost ready..."];

function setLoading(isLoading) {
    const msgElement = document.getElementById('loadingTextMsg');
    if (isLoading) {
        loadingState.classList.remove('hidden');
        analyzeBtn.disabled = true;
        let c = 0;
        if(msgElement) msgElement.textContent = loadingTexts[0];
        loadingInterval = setInterval(() => {
            c = (c + 1) % loadingTexts.length;
            if(msgElement) msgElement.textContent = loadingTexts[c];
        }, 2000);
    } else {
        clearInterval(loadingInterval);
        loadingState.classList.add('hidden');
        analyzeBtn.disabled = !selectedFile;
    }
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
}

const uiTranslations = {
    'English': { ing: 'Ingredients', steps: 'Step-by-Step Instructions', sim: 'Try Similar Recipes', origin: 'Origin:', serves: 'Serves:', prep: 'Prep:', cook: 'Cook:', swap: 'Swap', revert: 'Revert', gen: 'Generate Recipe', iAdults: '👨 Adults:', iKids: '🧒 Kids:', analyze: 'Analyze Dish' },
    'Spanish': { ing: 'Ingredientes', steps: 'Instrucciones paso a paso', sim: 'Prueba recetas similares', origin: 'Origen:', serves: 'Porciones:', prep: 'Prep:', cook: 'Cocción:', swap: 'Cambiar', revert: 'Revertir', gen: 'Generar Receta', iAdults: '👨 Adultos:', iKids: '🧒 Niños:', analyze: 'Analizar Plato' },
    'French': { ing: 'Ingrédients', steps: 'Instructions', sim: 'Essayez des recettes similaires', origin: 'Origine:', serves: 'Portions:', prep: 'Prépa:', cook: 'Cuisson:', swap: 'Échanger', revert: 'Rétablir', gen: 'Générer la Recette', iAdults: '👨 Adultes:', iKids: '🧒 Enfants:', analyze: 'Analyser le Plat' },
    'Hindi': { ing: 'सामग्री', steps: 'चरण-दर-चरण निर्देश', sim: 'समान रेसिपी आज़माएं', origin: 'मूल:', serves: 'परोसें:', prep: 'तैयारी:', cook: 'पकाना:', swap: 'बदलें', revert: 'वापस लें', gen: 'रेसिपी बनाएँ', iAdults: '👨 वयस्क:', iKids: '🧒 बच्चे:', analyze: 'डिश का विश्लेषण' },
    'Japanese': { ing: '材料', steps: '手順', sim: '似たレシピを試す', origin: '起源:', serves: '提供:', prep: '準備:', cook: '調理:', swap: '変更', revert: '元に戻す', gen: 'レシピを作成', iAdults: '👨 大人:', iKids: '🧒 子供:', analyze: '料理を分析' },
    'Kannada': { ing: 'ಪದಾರ್ಥಗಳು', steps: 'ಹಂತ-ಹಂತದ ಸೂಚನೆಗಳು', sim: 'ಇದೇ ರೀತಿಯ ಪಾಕವಿಧಾನಗಳನ್ನು ಪ್ರಯತ್ನಿಸಿ', origin: 'ಮೂಲ:', serves: 'ಸೇವೆಗಳು:', prep: 'ತಯಾರಿ:', cook: 'ಅಡುಗೆ:', swap: 'ಬದಲಾಯಿಸಿ', revert: 'ಹಿಂದಕ್ಕೆ', gen: 'ಪಾಕವಿಧಾನ ರಚಿಸಿ', iAdults: '👨 ವಯಸ್ಕರು:', iKids: '🧒 ಮಕ್ಕಳು:', analyze: 'ಪಾಕವಿಧಾನ ಪರಿಶೀಲಿಸಿ' }
};

function applyUITranslations() {
    const lang = languageSelect.value;
    const t = uiTranslations[lang] || uiTranslations['English'];
    
    document.querySelector('.ingredients-box h3').innerHTML = `<i class="fa-solid fa-basket-shopping"></i> ${t.ing}`;
    document.querySelector('.instructions-box h3').innerHTML = `<i class="fa-solid fa-list-ol"></i> ${t.steps}`;
    document.querySelector('.similar-box h3').innerHTML = `<i class="fa-solid fa-utensils"></i> ${t.sim}`;
    document.getElementById('lblOrigin').textContent = t.origin;
    document.getElementById('lblPrep').textContent = t.prep;
    document.getElementById('lblCook').textContent = t.cook;
    if(document.getElementById('lblServes')) document.getElementById('lblServes').textContent = t.serves;
    
    if(document.getElementById('lblInputAdults')) document.getElementById('lblInputAdults').textContent = t.iAdults;
    if(document.getElementById('lblInputKids')) document.getElementById('lblInputKids').textContent = t.iKids;
    if(document.getElementById('lblAnalyzeBtn')) document.getElementById('lblAnalyzeBtn').textContent = t.analyze;
}

languageSelect.addEventListener('change', async () => {
    applyUITranslations();
    if (currentRecipe) {
        try {
            setLoading(true);
            const msgElement = document.getElementById('loadingTextMsg');
            if (msgElement) msgElement.textContent = "Translating recipe...";
            
            const res = await fetch('/api/translate-recipe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipe: currentRecipe, language: languageSelect.value })
            });
            if (!res.ok) throw new Error('Translation failed');
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            
            currentRecipe = data;
            renderRecipe();
        } catch (err) {
            console.error(err);
            showError("Translation error: " + err.message);
        } finally {
            setLoading(false);
        }
    }
});
