let totalMood = 0;
let counter = 0;

function addMood(mood) {
    totalMood += mood;
    counter++;
}

function showAverageMood() {
    averageMood = totalMood / counter;

    if (averageMood < 0) {
        averageMood = 1;
    }
    if (averageMood == 0 || averageMood == null || averageMood == NaN) {
        document.getElementById("ergebnis").style.display = "block";
        document.getElementById("ergebnis").textContent = "Nobody voted yet";
    }
    else {
        document.getElementById("ergebnis").style.display = "block";
        document.getElementById("ergebnis").textContent = "The average mood is: " + averageMood;
    }
}

function resetAll() {
    averageMood = 0;
    totalMood = 0;
    counter = 0;
}

function enterTA() {
    const textarea = document.getElementById("eingabe");
    const liste = document.getElementById("liste");

    const li = document.createElement("li");
    li.textContent = textarea.value;

    liste.appendChild(li);

    textarea.value = "";
    textarea.placeholder = "Neuer Eintrag...";
}