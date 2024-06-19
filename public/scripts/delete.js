
const del = document.querySelectorAll(".delete");
const itemContainer = document.querySelectorAll(".item");


del.forEach(delItem =>{
    delItem.addEventListener('click', ()=>{
        console.log("Hello world");
        const itemContainer = delItem.closest(".item");
        itemContainer.classList.add('move');

        setTimeout(() => {
            itemContainer.classList.add('move-item');
        }, 1000);
    });
    console.log(delItem);
});