const socket = io.connect()



const gameBoard = document.querySelector("#gameboard")
const playerDisplay = document.querySelector("#player")
const infoStatus = document.querySelector("#info")
const width = 8

const redScoreBoard = document.querySelector(".red-score")
const blueScoreBoard = document.querySelector(".blue-score")

const infoDisplay = document.querySelector("#info-display")
const userContainer = document.getElementById('user-container')
const gameContainer = document.querySelector('#game-container')

// //modal to boi
// const modalRed = document.querySelector(".modal-red-wins");
// const modalBlue = document.querySelector(".modal-blue-wins");
// const trigger = document.querySelector(".trigger");


const roomForm = document.querySelector('#room-form')
const nameInput = document.querySelector('#name-input')
const roomInput = document.querySelector('#room-input')
const createButton = document.getElementById("create-button");
const findButton = document.getElementById("find-button");
let player1 = ''
let player2 = ''
let roomId = ''
let playerColor = '' 
let opponentColor = ''
let yourTurn = false
let pieceJumping = ''
gameContainer.style.display = 'None'
let roomCreated = false // prevents the same user joining after creating a room
 
/// ----------------------------------------------------------SOCKET ON
socket.on('room-created', roomId => {
    const notif = document.querySelector('#notif')
    const waiting = document.createElement('div')
    waiting.textContent = 'Waiting for other players...'
    notif.textContent = `Room ID:${roomId}`
    notif.appendChild(waiting)
    roomCreated = true
})


socket.on('show-player2', (playerId, roomId) => {  // join room
    gameContainer.style.display = 'block'
    roomForm.style.display = 'None'

    player2 = playerId
    socket.emit('player1-joined', player1, roomId)
    updateOpponentInfo()
    createPlayerBoard()
    setInterval(updateSessionTime, 1000)
    updateRoundTime()

})

socket.on('show-player1', (playerId, roomId) => {
    player2 = playerId
    gameContainer.style.display = 'block'
    roomForm.style.display = 'None'
    updateOpponentInfo()
    createPlayerBoard()
    setInterval(updateSessionTime, 1000)
    updateRoundTime()

})


socket.on('moved-piece-id', pieceId => {
    const draggedPiece = document.querySelector(`#${pieceId.draggedElementId}`)
    const targetSquare = document.querySelector(`[square-id="${pieceId.targetId}"]`)
    
    targetSquare.append(draggedPiece)
    
    scanPrioEat()
    updateRoundTime()
})
socket.on('make-king', piece => {
    console.log(piece)
    const targetSquare = document.querySelector(`#${piece}`)
    makeKing(targetSquare, opponentColor)
})


socket.on('remove-piece', removedPieceId => {
    const pieceToRemove = document.querySelector(`#${removedPieceId}`)
    removePiece(pieceToRemove, playerColor)
})

socket.on('change-player-opponent', () => {
    yourTurn = true
    playerDisplay.textContent = playerColor
    if(opponentColor === 'red'){
        gameboard.style.borderColor = "#006791";
    }else{
        gameboard.style.borderColor = "#9C090C";
    }
})

socket.on('update-score', (result, playerColor) => {
    updateScoreBoard(result, playerColor)
})


socket.on('append-history', (textHistory, playerColor) =>{
    console.log(textHistory, playerColor)
    appendHistory(textHistory, playerColor)
})

socket.on('win-condition', winColor => {
    winCondition(winColor)
})


socket.on('opponent-disconnected', () => {
    window.alert('Opponent disconnected')
    location.reload();
})



createButton.addEventListener('click', e => { // create room
    e.preventDefault()
    playerColor = 'red'
    opponentColor = 'blue'
    playerDisplay.textContent = playerColor
    const name = nameInput.value
    const room = roomInput.value
    roomId = room
    player1 = name
    yourTurn = true
    console.log(name, room)
    
    
    
    socket.emit('create-room', name, room, roomExists => {
        const notif = document.querySelector('#notif')
        notif.textContent = roomExists
        setTimeout(() => notif.textContent = '', 2000)
        console.log(roomExists) //cannot create room, roomId already exist
    })
})


findButton.addEventListener('click', e => {
    e.preventDefault()

    if(!roomCreated){
        playerColor = 'blue'
        opponentColor = 'red'
        playerDisplay.textContent = opponentColor
        
        const name = nameInput.value
        const room = roomInput.value
        player2 = name
        console.log(name, room)
    
        socket.emit('join-room', name, room, roomFull => {
            const notif = document.querySelector('#notif')
            notif.textContent = roomFull
            setTimeout(() => notif.textContent = '', 2000)
            console.log(roomFull) //cannot join room, room contains 2 players
        })
    }
})


function updateOpponentInfo() {
    const opponent = document.querySelector('#opponent')
    opponent.textContent = `playing against ${player2}`
}






function appendUser(user){
    const userElement = document.createElement('div')
    userElement.innerText = user
    userContainer.append(userElement)
}



const startPieces2 = [
    rkwh3, '', rp6, '', rkwh9, '', rp12, '', 
    '', rp8, '', rkwh11, '', rp4, '', rkwh1, 
    rkwh5, '', rp2, '', rkwh7, '', rp10, '', 
    '', '', '', '', '', '', '', '', 
    '', '', '', '', '', '', '', '', 
    '', bp10, '', bkwh7, '', bp2, '', bkwh5, 
    bkwh1, '', bp4, '', bkwh11, '', bp8, '', 
    '', bp12, '', bkwh9, '', bp6, '', bkwh3, 
]


const startPieces1 = [
    bkwh3, '', bp6, '', bkwh9, '', bp12, '', 
    '', bp8, '', bkwh11, '', bp4, '', bkwh1, 
    bkwh5, '', bp2, '', bkwh7, '', bp10, '', 
    '', '', '', '', '', '', '', '', 
    '', '', '', '', '', '', '', '', 
    '', rp10, '', rkwh7, '', rp2, '', rkwh5, 
    rkwh1, '', rp4, '', rkwh11, '', rp8, '', 
    '', rp12, '', rkwh9, '', rp6, '', rkwh3, 
]


const operator = [
    'multiply', '', 'divide','', 'subtract','', 'add','',
    '', 'divide','', 'multiply', '','add','', 'subtract',
    'subtract', '', 'add', '', 'multiply', '', 'divide','',
    '', 'add', '', 'subtract', '', 'divide','', 'multiply',
    'multiply', '', 'divide','', 'subtract','', 'add','',
    '', 'divide','', 'multiply', '','add','', 'subtract',
    'subtract', '', 'add', '', 'multiply', '', 'divide','',
    '', 'add', '', 'subtract', '', 'divide','', 'multiply'
]



function createBoard() {
    
    if(playerColor === 'red'){
        chips = startPieces1
    }else{
        chips = startPieces2
    }

    chips.forEach((startPieces, i) => {
        const square = document.createElement('div')
        square.classList.add('square')
        square.setAttribute('square-id', (width * width -1)-i)
        

        const row = Math.floor( (63 - i) / 8) + 1
        if( row % 2 === 0){
            square.classList.add(i % 2 === 0 ? "white" : "green")
        } else {
            square.classList.add(i % 2 === 0 ? "green" : "white")
        }



        // ----------------------------adding piece---------------------------
        square.innerHTML = startPieces
        square.firstChild?.setAttribute('draggable', true)
        if ( i <= 23){
            if(square.firstChild){
                if(playerColor === 'red'){
                    square.firstChild.firstChild.classList.add("blue")
                    bluePieceLeft.push(square.firstChild)
                }else{
                    square.firstChild.firstChild.classList.add("red")
                    redPieceLeft.push(square.firstChild)
                }
            }
        }
        if ( i >= 40){
            if(square.firstChild){
                if(playerColor === 'red'){
                    square.firstChild.firstChild.classList.add("red")
                    redPieceLeft.push(square.firstChild)
                }else{
                    square.firstChild.firstChild.classList.add("blue")
                    bluePieceLeft.push(square.firstChild)
                }
            }
        }

        // --------------------adding operator on the board ---------------------------
        const op = operator[i]
        if (op) {
            square.classList.add(op);
        }
        gameBoard.append(square)
    })
}

function createCoordinates(){
    const yCoordinatesContainer = document.querySelector('.y-coordinates');
    const xCoordinatesContainer = document.querySelector('.x-coordinates');

    if(playerColor === 'red'){
        for (let i = 7; i >= 0; i--) {
            const yCoordElement = document.createElement('div');
            yCoordElement.className = 'coordinates-height';
            yCoordElement.textContent = i;
            yCoordinatesContainer.appendChild(yCoordElement);
          }

        for(let i = 0; i <=7; i++){
            const xCoordElement = document.createElement('div');
            xCoordElement.className = 'coordinates-width';
            xCoordElement.textContent = i;
            xCoordinatesContainer.appendChild(xCoordElement);
        }
    }else{
        for (let i = 0; i <= 7; i++) {
            const yCoordElement = document.createElement('div');
            yCoordElement.className = 'coordinates-height';
            yCoordElement.textContent = i;
            yCoordinatesContainer.appendChild(yCoordElement);
          }

        for(let i = 7; i >=0; i--){
            const xCoordElement = document.createElement('div');
            xCoordElement.className = 'coordinates-width';
            xCoordElement.textContent = i;
            xCoordinatesContainer.appendChild(xCoordElement);
        }
    }



}

function createPlayerBoard(playerColor){
    createBoard()
    createCoordinates()

    const allSquares = document.querySelectorAll(".square")
    allSquares.forEach(square => {
        square.addEventListener('dragstart', dragStart)
        square.addEventListener('dragover', dragOver)
        square.addEventListener('drop', dragDrop)
        square.addEventListener('mouseover', mouseOver)
        square.addEventListener('mouseout', mouseOut)
        square.addEventListener('click', mouseClick)
        square.addEventListener('touchstart', touchStart)
    })
}

function touchStart(e){
    if(normalValidMoves.includes(e.target)){// DRAG DROP
        if(priorityEat.length){ // if there is to eat.
            e.target.append(clickedElement)
            pieceJumping  = clickedElement

            if(clickedElement.classList.contains('king')){
                for (const [eatenPiece, eatenMoves] of captureInfo) {
                    console.log(eatenPiece,eatenMoves)
                    if(eatenMoves.includes(e.target)){
                        socket.emit('remove-piece', eatenPiece.getAttribute('id'))
                        removePiece(eatenPiece, opponentColor)
                        console.log(true)
                    }else[
                        console.log(false)
                    ]

                    const isCapture = kingValidMoves(clickedElement)
                    if(!isCapture){
                        changePlayer()
                        socket.emit('change-player')
                    }
                }
            }else{
                for (const [eatenPiece, eatenMoves] of captureInfo) {
                    if(eatenMoves === e.target){
                        socket.emit('remove-piece', eatenPiece.getAttribute('id'))
                        removePiece(eatenPiece, opponentColor)
                    }
                }
                const isCapture = checkNormalCaptures(e.target.firstChild)
                if(!isCapture){
                    if(upLimit.includes(Number(e.target.getAttribute('square-id')))){
                        makeKing(clickedElement, playerColor)
                        socket.emit('make-king', clickedElement.getAttribute('id'))
                    }
                    changePlayer()
                    socket.emit('change-player')
                }
            }
            
            socket.emit('move-piece', {draggedElementId: clickedElement.getAttribute('id'), targetId: e.target.getAttribute('square-id')}) 
            updateRoundTime()
            scanPrioEat()

            console.log(attackPiece, defendPiece)
            console.log(draggedElement, clickedElement)
            calculatePoints(e.target)


        }else{ // no eat
            dragDropCoordinates = getRowCol(e.target)
            const textHistory = attackPiece.type+ `${attackPiece.value} (${dragStartCoordinates})->(${dragDropCoordinates})`
            // appendHistory(appendText, playerColor)
            socket.emit('append-history', textHistory, playerColor)

            e.target.append(clickedElement)
            socket.emit('move-piece', {draggedElementId: clickedElement.getAttribute('id'), targetId: e.target.getAttribute('square-id')}) 
            updateRoundTime()
            if(upLimit.includes(Number(e.target.getAttribute('square-id')))){
                makeKing(clickedElement, playerColor)
                console.log(clickedElement)
                socket.emit('make-king', clickedElement.getAttribute('id'))
            }
            changePlayer()
            socket.emit('change-player')
            
        }
        clearValid()
        yellowToNormal()

        //----------------------------------------------WIN CONDITION------------------------
        if(bluePieceLeft.length === 0 || redPieceLeft.length === 0){
            playSoundEffect('endgame_win001')
            window.alert('game finished!')
        }

        console.log('red: ',redPieceLeft.length,'\nblue: ',bluePieceLeft.length)

    }else if(yourTurn && e.target.firstChild && e.target.firstChild.classList.contains(playerColor)){ //drag start
        clickedElement = e.target
        const isKing = clickedElement.classList.contains('king')
        dragStartCoordinates = getRowCol(e.target.parentNode)
        getPieceValue(clickedElement, attackPiece)

       
        if(priorityEat.length){
            if(priorityEat.includes(e.target)){
                if(isKing){
                    redToNormal()
                    kingValidMoves(clickedElement)
                    drawValidMoves(normalValidMoves) 

                }else{
                    redToNormal()
                    checkNormalCaptures(clickedElement)
                    drawValidMoves(normalValidMoves)
                }
                
            }else{
                drawPrioEat()
                yellowToNormal()
                playSoundEffect('move-illegal001')
            }

        }else {
            if(isKing){
                normalValidMoves = []
                yellowToNormal()
                kingValidMoves(clickedElement)
                drawValidMoves(normalValidMoves)   

            }else{
                normalValidMoves = []
                yellowToNormal()
                checkNormalValidMoves(clickedElement)
                drawValidMoves(normalValidMoves)   
            }
        }  
    }else{
        yellowToNormal()
    }
}


function mouseClick(e){
     if(e.target.classList.contains('piece')){
        // setTimeout(() => transparentize(e), 2000)
        // e.target.style.opacity = .5
//  --------  all piece becomes king (for testing only. comment this out)----
        // const kingImage = document.createElement('img');
        // kingImage.src = 'assets/red_crown.png'; 
        // kingImage.classList.add('king-image');
        // e.target.classList.add('king')
        // e.target.appendChild(kingImage);
// -------------------------------------------------------------------------
    }
}

function scanPrioEat(){
    priorityEat = []
    if(pieceJumping){
        priorityEat.push(pieceJumping)
    } else {
        const pieces = document.querySelectorAll('.piece')
        pieces.forEach(piece => {
            if(piece.firstChild.classList.contains(playerColor)){
                const isKing = piece.classList.contains('king')
                if(isKing){
                    let isCapture = kingValidMoves(piece)
                    if(isCapture){
                        priorityEat.push(piece)
                    }
                }else{
                    let isCapture = checkNormalCaptures(piece)
                    if(isCapture){
                        priorityEat.push(piece)
                    }
                }
                
            }
        })
        clearValid()
    }
}


let priorityEat = []
let normalValidMoves = []
let kingCaptureMoves = null
const captureInfo = new Map()
let draggedElement = ''
let clickedElement = ''

let eatenChip = ''
let blueScore = 0
let redScore = 0
const pesoValue = 3

let dragStartCoordinates
let dragDropCoordinates

let bluePieceLeft = []
let redPieceLeft = []

//  ----------------------------------------------EVENT HANDLERS ---------------------------------------------

function dragStart (e) {
    if(yourTurn && e.target.firstChild.classList.contains(playerColor)){
        draggedElement = e.target;
        
        const isKing = draggedElement.classList.contains('king')
        e.dataTransfer.setDragImage(draggedElement, 37,37);

        dragStartCoordinates = getRowCol(e.target.parentNode)
        getPieceValue(draggedElement, attackPiece)
        if(isKing){
            if(priorityEat.includes(draggedElement)){
                redToNormal()
                kingValidMoves(draggedElement)
                drawValidMoves(normalValidMoves)
            }else if(priorityEat.length === 0) {
                console.log(true)
                kingValidMoves(draggedElement)
                drawValidMoves(normalValidMoves)
            }
            else{
                drawPrioEat()
                playSoundEffect('move-illegal001')
            }

        } else {
            if(priorityEat.includes(draggedElement)){
                redToNormal()
                checkNormalCaptures(draggedElement)
                drawValidMoves(normalValidMoves)
            }else if(priorityEat.length === 0){
                checkNormalValidMoves(draggedElement)
                drawValidMoves(normalValidMoves)
            }else{
                drawPrioEat()
                playSoundEffect('move-illegal001')
            }
        }
    }else{
        playSoundEffect('move-illegal001')
    }
}

function dragOver (e){
    e.preventDefault()
}

function dragDrop (e) {
    e.stopPropagation()

    if(priorityEat.length){ // if there is to capture
        if(priorityEat.includes(draggedElement) && normalValidMoves.includes(e.target)){
            e.target.append(draggedElement)
            playSoundEffect('move-attackcombo001')

            pieceJumping  = draggedElement
            
            if(draggedElement.classList.contains('king')){ // if there is to capture and piece is KING
                for (const [eatenPiece, eatenMoves] of captureInfo) {
                    console.log(captureInfo)
                    if(eatenMoves.includes(e.target)){
                        socket.emit('remove-piece', eatenPiece.getAttribute('id'))
                        removePiece(eatenPiece, opponentColor)
                        eatenChip = eatenPiece
                    }
                }
                const isCapture = kingValidMoves(draggedElement)
                if(!isCapture){
                    changePlayer()
                    socket.emit('change-player')
                }

                 
            }else { // if there is to capture and piece is NORMAL
                for (const [eatenPiece, eatenMoves] of captureInfo) {
                    if(eatenMoves === e.target){
                        socket.emit('remove-piece', eatenPiece.getAttribute('id'))
                        removePiece(eatenPiece, opponentColor)
                        eatenChip = eatenPiece
                    }
                }

                const isCapture = checkNormalCaptures(e.target.firstChild)
                if(!isCapture){
                    if(upLimit.includes(Number(e.target.getAttribute('square-id')))){
                        makeKing(draggedElement, playerColor)
                        socket.emit('make-king', draggedElement.getAttribute('id'))
                    }
                    changePlayer()
                    socket.emit('change-player')
                }
            }
            
            socket.emit('move-piece', {draggedElementId: draggedElement.getAttribute('id'), targetId: e.target.getAttribute('square-id')}) 

            updateRoundTime()

            calculatePoints(e.target)
        }

    }else{ // if there is no piece to capture
        if(normalValidMoves.includes(e.target)){
            dragDropCoordinates = getRowCol(e.target)
            const textHistory = attackPiece.type+ `${attackPiece.value} (${dragStartCoordinates})->(${dragDropCoordinates})`
            // appendHistory(appendText, playerColor)
            socket.emit('append-history', textHistory,playerColor)

            e.target.append(draggedElement)
            playSoundEffect('move-attack001')
            if(upLimit.includes(Number(e.target.getAttribute('square-id')))){
                makeKing(draggedElement, playerColor)
                socket.emit('make-king', draggedElement.getAttribute('id'))
            }
            socket.emit('move-piece', {draggedElementId: draggedElement.getAttribute('id'), targetId: e.target.getAttribute('square-id')})  
            updateRoundTime()
            socket.emit('change-player')
            changePlayer()
        }
    }
    
    clearValid()
    yellowToNormal()
    scanPrioEat()


    //----------------------------------------------WIN CONDITION------------------------

    if(bluePieceLeft.length === 0){ //if there is no blue left, only red piece remaining are copmuted
        playSoundEffect('endgame_win001')
        socket.emit('win-condition', 'red')
    }else if(redPieceLeft.length === 0){
        playSoundEffect('endgame_win001')
        socket.emit('win-condition', 'blue')
    }

    console.log('red: ',redPieceLeft.length,'\nblue: ',bluePieceLeft.length)
}

function winCondition(winColor){

    let result = 0
    let subtotal

    appendHistory('---------Remaining Chips--------')
    const remaining = document.querySelectorAll('.piece')
    remaining.forEach(piece => {
        getPieceValue(piece, remainingPiece)
        if(remainingPiece.type === 'kwh'){
            if(piece.classList.contains('king')){
                subtotal = remainingPiece.value*2*pesoValue
                const textHistory = `${remainingPiece.type+remainingPiece.value} * 2 *${pesoValue} = P${remainingPiece.value*2*pesoValue}`
                socket.emit('append-history', textHistory, winColor)
            }else{
                subtotal = remainingPiece.value*pesoValue
                const textHistory = `${remainingPiece.type+remainingPiece.value} * ${pesoValue} = P${remainingPiece.value*pesoValue}`
                socket.emit('append-history', textHistory, winColor)
            }
        }else{
            if(piece.classList.contains('king')){
                subtotal = remainingPiece.value*2
                const textHistory = `${remainingPiece.type+remainingPiece.value} * 2 = P${remainingPiece.value*2}`
                socket.emit('append-history', textHistory, winColor)
            }else{
                subtotal = remainingPiece.value
                const textHistory = `${remainingPiece.type+remainingPiece.value}`
                socket.emit('append-history', textHistory, winColor)
            }
        }
        result += subtotal
    })

    socket.emit('append-history', `Remaining Chips = P${result}`, winColor)

    if(winColor === 'blue'){
        const textHistory = `P${result} + P${blueScore} = P${result+blueScore}`
        socket.emit('append-history', textHistory, winColor)
    }else{
        const textHistory = `P${result} + P${redScore} = P${result+redScore}`
        socket.emit('append-history', textHistory, winColor)
    }
    socket.emit('append-history', '--------------------------------', winColor)


    socket.emit('update-score', result, winColor)
    
    setTimeout(() => showWin(), 1000)
}

// //modal to boi
// function toggleModalRed() {
//     modalRed.classList.toggle("show-modal");
// }

// function toggleModalBlue() {
//     modalBlue.classList.toggle("show-modal");
// }

// trigger.addEventListener("click", toggleModalRed);
// trigger2.addEventListener("click", toggleModalBlue);

/*---------------------------------------------------------------------------------------------------------------------------------- */
function showWin(){
    if(redScore < blueScore){
        window.alert('RED WINS!')
    }else if(redScore > blueScore){
        window.alert('BLUE WINS!')
    }else{
        window.alert('DRAW!')
    }
    gameFinished = true
}


function kingValidMoves(draggedElement){
    const state1 = upleftKing(draggedElement)
    const state2 = uprightKing(draggedElement)
    const state3 = downleftKing(draggedElement)
    const state4 = downrightKing(draggedElement)

    if(state1 || state2 || state3 || state4){
        normalValidMoves = []

        if(state1){
            kingCaptureMoves = []
            upleftKing(state1.firstChild)
            kingCaptureMoves.forEach(moves => {
                normalValidMoves.push(moves)
            })
            captureInfo.set(state1.firstChild, kingCaptureMoves)
        }
        if(state2){
            kingCaptureMoves = []
            uprightKing(state2.firstChild)
            kingCaptureMoves.forEach(moves => {
                normalValidMoves.push(moves)
            }) 
            captureInfo.set(state2.firstChild, kingCaptureMoves)
        }
        if(state3){
            kingCaptureMoves = []
            downleftKing(state3.firstChild)
            kingCaptureMoves.forEach(moves => {
                normalValidMoves.push(moves)
            }) 
            captureInfo.set(state3.firstChild, kingCaptureMoves)
        }
        if(state4){
            kingCaptureMoves = []
            downrightKing(state4.firstChild)
            kingCaptureMoves.forEach(moves => {
                normalValidMoves.push(moves)
            }) 
            captureInfo.set(state4.firstChild, kingCaptureMoves)
        }

        return true
    }
}

function upleftKing(draggedElement){
    if(upLeftLimit(draggedElement.parentNode)){
        let upleft = getSquareOnUpLeft(draggedElement.parentNode)
        while(!upleft.firstChild){ // loop while empty, stops if there's a piece
            if(kingCaptureMoves === null){
                if(!upLeftLimit(upleft)){
                    normalValidMoves.push(upleft)
                    break
                }else{
                    normalValidMoves.push(upleft)
                }
            }else{
                if(!upLeftLimit(upleft)){
                    kingCaptureMoves.push(upleft)
                    break
                }else{
                    kingCaptureMoves.push(upleft)
                }
            }
            upleft = getSquareOnUpLeft(upleft)
        } 
        if(upleft.firstChild && upleft.firstChild.firstChild.classList.contains(opponentColor) && upLeftLimit(upleft) && !getSquareOnUpLeft(upleft).firstChild) { // if piece is ooponent and the next square is empty (can be eaten)
            return upleft
        }else{
            return false
        }
    }
}

function uprightKing(draggedElement) {
    if(upRightLimit(draggedElement.parentNode)){
        let upright = getSquareOnUpRight(draggedElement.parentNode)
        while(!upright.firstChild){ // stops if there's a piece
            if(kingCaptureMoves === null){
                if(!upRightLimit(upright)){
                    normalValidMoves.push(upright)
                    break
                }else{
                    normalValidMoves.push(upright)
                }
            }else{
                if(!upRightLimit(upright)){
                    kingCaptureMoves.push(upright)
                    break
                }else{
                    kingCaptureMoves.push(upright)
                }
            }
            upright = getSquareOnUpRight(upright)
        }
        if(upright.firstChild && upright.firstChild.firstChild.classList.contains(opponentColor) && upRightLimit(upright) && !getSquareOnUpRight(upright).firstChild) {// if piece is ooponent and the next square is empty (can be eaten)
            return upright
        }else{
            return false
        }
    }
}

function downleftKing(draggedElement){
    if(downLeftLimit(draggedElement.parentNode)){
        let downleft = getSquareOnDownLeft(draggedElement.parentNode)
        while(!downleft.firstChild){ // stops if there's a piece
            if(kingCaptureMoves === null) {
                if(!downLeftLimit(downleft)){
                    normalValidMoves.push(downleft)
                    break
                }else{
                    normalValidMoves.push(downleft)
                }
            }else{
                if(!downLeftLimit(downleft)){
                    kingCaptureMoves.push(downleft)
                    break
                }else{
                    kingCaptureMoves.push(downleft)
                }
            }
            downleft = getSquareOnDownLeft(downleft)
        }
        if(downleft.firstChild && downleft.firstChild.firstChild.classList.contains(opponentColor) && downLeftLimit(downleft) && !getSquareOnDownLeft(downleft).firstChild) {// if piece is ooponent and the next square is empty (can be eaten)
            return downleft
        }else{
            return false
        }
    }
}

function downrightKing(draggedElement) {
    if(downRightLimit(draggedElement.parentNode)){
        let downright = getSquareOnDownRight(draggedElement.parentNode)
        while(!downright.firstChild){ // stops if there's a piece
            if(kingCaptureMoves === null){
                if(!downRightLimit(downright)){
                    normalValidMoves.push(downright)
                    break
                }else{
                    normalValidMoves.push(downright)
                }
            }else{
                if(!downRightLimit(downright)){
                    kingCaptureMoves.push(downright)
                    break
                }else{
                    kingCaptureMoves.push(downright)
                }
            }
            downright = getSquareOnDownRight(downright)
        }
        if(downright.firstChild && downright.firstChild.firstChild.classList.contains(opponentColor) && downRightLimit(downright) && !getSquareOnDownRight(downright).firstChild) {// if piece is ooponent and the next square is empty (can be eaten)
            return downright
        }else{
            return false
        }
    }
}




function checkNormalValidMoves(selectedElement){
    const selectedElementParent = selectedElement.parentNode
    const upleft = getSquareOnUpLeft(selectedElementParent)
    const upright = getSquareOnUpRight(selectedElementParent)
    if(priorityEat.length === 0){
        if(!upleft.firstChild && upLeftLimit(selectedElementParent)){
            normalValidMoves.push(upleft)
        }
        if(!upright.firstChild && upRightLimit(selectedElementParent)){
            normalValidMoves.push(upright)
        }
    }
    
}

function checkNormalCaptures(pieceElement) {
    let isCapture = false
    const pieceElementParent = pieceElement.parentNode

    const upleft = getSquareOnUpLeft(pieceElementParent)
    if(upleft !== null){
        const upleftSkip = getSquareOnUpLeft(upleft)
        if(upleftSkip !== null){
            if(upLeftLimit(pieceElementParent) && upLeftLimit(upleft) && upleft.firstChild && upleft.firstChild.firstChild.classList.contains(opponentColor) && !upleftSkip.firstChild){
                normalValidMoves.push(upleftSkip)
                isCapture = true
        
                captureInfo.set(upleft.firstChild, upleftSkip)
            }
        }
    }
   

    const upright = getSquareOnUpRight(pieceElementParent)
    if(upright !== null){
        const uprightSkip = getSquareOnUpRight(upright)
        if(uprightSkip !== null){
            if(upRightLimit(pieceElementParent) && upRightLimit(upright) && upright.firstChild && upright.firstChild.firstChild.classList.contains(opponentColor) && !uprightSkip.firstChild){
                normalValidMoves.push(uprightSkip)
                isCapture = true
                
                captureInfo.set(upright.firstChild, uprightSkip)
            }
        }
    }
    

    const downleft = getSquareOnDownLeft(pieceElementParent)
    if(downleft !== null){
        const downleftSkip = getSquareOnDownLeft(downleft)
        if(downleftSkip !== null){
            if(downLeftLimit(pieceElementParent) && downLeftLimit(downleft) && downleft.firstChild && downleft.firstChild.firstChild.classList.contains(opponentColor) && !downleftSkip.firstChild){
                normalValidMoves.push(downleftSkip)
                isCapture = true
        
                captureInfo.set(downleft.firstChild, downleftSkip)
            }
        }
    }
    
    
    const downright = getSquareOnDownRight(pieceElementParent)
    if(downright !== null){
        const downrightSkip = getSquareOnDownRight(downright)
        if(downrightSkip !== null){
            if(downRightLimit(pieceElementParent) && downRightLimit(downright) && downright.firstChild && downright.firstChild.firstChild.classList.contains(opponentColor) && !downrightSkip.firstChild){
                normalValidMoves.push(downrightSkip)
                isCapture = true
        
                captureInfo.set(downright.firstChild, downrightSkip)
            }
        }
    }
    
    return isCapture
}


const startingMinutes = 20 ;
let sessionCountDown = startingMinutes * 60

const startingSeconds = 60;
let roundCountDown = startingSeconds;

const sessionTime = document.getElementById('session-time')
const roundTime = document.getElementById('round-time')

function updateSessionTime(){
    if(sessionCountDown <= 0){
        window.alert('game over time is up!')
    }

    const minutes = Math.floor(sessionCountDown / 60);
    let seconds = sessionCountDown % 60;

    seconds = seconds < 10 ? '0' + seconds : seconds;

    sessionTime.innerHTML = `${minutes}:${seconds}`
    sessionCountDown--;
}

let roundInterval;
function updateRoundTime(){
    clearInterval(roundInterval)

    roundCountDown = startingSeconds
    if(playerColor === 'red'){
        roundTime.color = '#9C090C'
    }else{
        roundTime.color = '#006791'
    }
    roundInterval = setInterval(roundTimeCountDown,1000)
}

function roundTimeCountDown(){
    if(roundCountDown <= 0){
        window.alert('game over time is up!')
        location.reload();
    clearInterval(roundInterval)

    }

    roundTime.innerHTML = `:${roundCountDown}`
    roundCountDown --;
}
















function getSquareOnUpLeft(pieceSquare){
    const pieceSquareId = Number(pieceSquare.getAttribute('square-id'))
    const upleftSquare = document.querySelector(`[square-id="${pieceSquareId + width + 1}"]`)
    return upleftSquare
}

function getSquareOnUpRight(pieceSquare){
    const pieceSquareId = Number(pieceSquare.getAttribute('square-id'))
    const uprightSquare = document.querySelector(`[square-id="${pieceSquareId + width - 1}"]`)
    return uprightSquare
}

function getSquareOnDownLeft(pieceSquare){
    const pieceSquareId = Number(pieceSquare.getAttribute('square-id'))
    const downleftSquare = document.querySelector(`[square-id="${pieceSquareId - width + 1}"]`)
    return downleftSquare
}

function getSquareOnDownRight(pieceSquare){
    const pieceSquareId = Number(pieceSquare.getAttribute('square-id'))
    const downrightSquare = document.querySelector(`[square-id="${pieceSquareId - width - 1}"]`)
    return downrightSquare
}

function removePiece(piece, removeColor) {
    getPieceValue(piece, defendPiece)
    piece.remove()

    if(removeColor == 'blue'){
        bluePieceLeft = removeFromArray(bluePieceLeft, piece)
    }else{
        redPieceLeft = removeFromArray(redPieceLeft, piece)
    }
}

function makeKing(piece, player){
    playSoundEffect('move-promotion001')


    const kingImage = document.createElement('img');
    if(player == 'blue'){
        kingImage.src = 'assets/blue_crown.png'; // Set the path to your crown image
    }else{
        kingImage.src = 'assets/red_crown.png'; // Set the path to your crown image
    }
    kingImage.classList.add('king-image');
  
    piece.classList.add('king')
    piece.appendChild(kingImage);
}
const roundTimeColor = document.querySelector('#round-time');

function changePlayer() {
    playerDisplay.textContent = opponentColor
    if(opponentColor === 'blue'){
        gameboard.style.borderColor = "#006791";
    }else{
        gameboard.style.borderColor = "#9C090C";
    }
    yourTurn = false
    pieceJumping = ''
    changeBorder()
}

function changeBorder(){
    
}



function clearValid(){
    normalValidMoves = []
    draggedElement = ''
    clickedElement = ''
    captureInfo.clear()
    kingCaptureMoves = null
}

function playSoundEffect(soundEffectId){
    const soundEffect = document.getElementById(soundEffectId)
    soundEffect.play()
}

function mouseOver(e){
    if(yourTurn && e.target.firstChild && e.target.firstChild.classList.contains(playerColor)){
        e.target.parentNode.classList.add('yellow')
    }
}

function mouseOut(e){
    if(yourTurn && e.target.firstChild && e.target.firstChild.classList.contains(playerColor)){
        e.target.parentNode.classList.remove('yellow')

    }
}

function drawPrioEat(){
    priorityEat.forEach(square => {
        square.parentNode.classList.add('red')
    })
}

function drawValidMoves(validMoves){
    validMoves.forEach(square => {
        square.classList.add('yellow')
    })
}

function yellowToNormal(){
    const yel = document.querySelectorAll('.square.yellow')
    yel.forEach(squares => {
        squares.classList.remove('yellow')
    })
}

function redToNormal(){
    const red = document.querySelectorAll('.square.red')
    red.forEach(squares => {
        squares.classList.remove('red')
    })
}

const upLimit = [56, 57, 58, 59, 60, 61, 62, 63]
const leftLimit = [7, 15, 23, 31, 39, 47, 55, 63]
const downLimit = [0, 1, 2, 3, 4, 5, 6, 7]
const rightLimit = [0, 8, 16, 24, 32, 40, 48, 56]



function upLeftLimit(square){   // if the square is not on edge
    if(leftLimit.includes(Number(square.getAttribute('square-id'))) ||
    upLimit.includes(Number(square.getAttribute('square-id')))){
        return false
    }else{
        return true
    }
}

function upRightLimit(square){  // if the square is not on edge
    if(rightLimit.includes(Number(square.getAttribute('square-id'))) ||
    upLimit.includes(Number(square.getAttribute('square-id')))){
        return false
    }else{
        return true
    }
}

function downLeftLimit(square){ // if the square is not on edge
    if(leftLimit.includes(Number(square.getAttribute('square-id'))) ||
    downLimit.includes(Number(square.getAttribute('square-id')))){
        return false
    }else{
        return true
    }
}

function downRightLimit(square){    // if the square is not on edge
    if(rightLimit.includes(Number(square.getAttribute('square-id'))) ||
    downLimit.includes(Number(square.getAttribute('square-id')))){
        return false
    }else{
        return true
    }
}


function removeFromArray(array, toRemove){
    const newArray = array.filter(item => item != toRemove)
    return newArray
}

const attackPiece = {type: '', value: 0}
const defendPiece = {type: '', value: 0}
const remainingPiece = {type: '', value: 0}



function updateScoreBoard(result, player){
    if(player === 'red'){
        console.log('Red Scoreboard:',redScore,'+',result,'=', redScore+result,'\n\n----------------------------')
        redScore += result
        redScoreBoard.textContent = redScore
    }else{
        console.log('Blue Scoreboard:',blueScore,'+',result,'=', blueScore+result,'\n\n----------------------------')
        blueScore += result
        blueScoreBoard.textContent = blueScore
    }

}



function calculatePoints(target){
    let selectedElement
    console.log(draggedElement, clickedElement)
    if(draggedElement){
        console.log('dragged')
        selectedElement = draggedElement
    }else if (clickedElement){
        console.log('cliciked')
        selectedElement = clickedElement
    }

    if(ifSamePieceType()){
        if(target.classList.contains('add')){
            result = attackPiece.value + defendPiece.value
            const textHistory = `${attackPiece.type+attackPiece.value} + ${defendPiece.type+defendPiece.value} = ${attackPiece.type}${result}`
            // appendHistory(textHistory, playerColor)
            socket.emit('append-history', textHistory,playerColor)
            console.log(attackPiece.type,attackPiece.value ,'+', defendPiece.type,defendPiece.value ,'=', result)

            if(selectedElement.classList.contains('king')){
                console.log('King piece',result,'*',2,'=',result*2)
                result *= 2
            }
            if(eatenChip.classList.contains('king')){
                console.log('Eaten piece is king',result,'*',2,'=',result*2)
                result *= 2
            }
            if(attackPiece.type === 'kwh'){
                console.log('kwh convert to Peso ',result,'*',pesoValue, '=', result*pesoValue)
                result*=pesoValue
            }
            socket.emit('update-score', result, playerColor)

        } else if(target.classList.contains('subtract')){
            result = attackPiece.value - defendPiece.value
            if(!(result < 0)) {
                const textHistory = `${attackPiece.type+attackPiece.value} - ${defendPiece.type+defendPiece.value} = ${attackPiece.type}${result}`
                // appendHistory(textHistory, playerColor)
                socket.emit('append-history', textHistory,playerColor)
                console.log(attackPiece.type,attackPiece.value ,'-', defendPiece.type,defendPiece.value ,'=', result)

                if(selectedElement.classList.contains('king')){
                    console.log('King piece',result,'*',2,'=',result*2)
                    result *= 2
                }
                if(eatenChip.classList.contains('king')){
                    console.log('Eaten piece is king',result,'*',2,'=',result*2)
                    result *= 2
                }
                if(attackPiece.type === 'kwh'){
                    console.log('kwh convert to Peso ',result,'*',pesoValue, '=', result*pesoValue)
                    result*=pesoValue
                }
            }else{
                result = 0
                const textHistory = `${attackPiece.type+attackPiece.value} - ${defendPiece.type+defendPiece.value} = NS`
                socket.emit('append-history', textHistory,playerColor)
                console.log(attackPiece.type,attackPiece.value ,'-', defendPiece.type,defendPiece.value ,'= No score')
            }
            socket.emit('update-score', result, playerColor)

        }else if(target.classList.contains('multiply')){
            console.log(attackPiece.type,attackPiece.value ,'*', defendPiece.type,defendPiece.value ,'= No score\n\n----------------------------')
            const textHistory = `${attackPiece.type+attackPiece.value} * ${defendPiece.type+defendPiece.value} = NS`
            // appendHistory(textHistory, playerColor)
            socket.emit('append-history', textHistory,playerColor)
        }else if(target.classList.contains('divide')){
            console.log(attackPiece.type,attackPiece.value ,'/', defendPiece.type,defendPiece.value ,'= No score\n\n----------------------------')
            const textHistory = `${attackPiece.type+attackPiece.value} / ${defendPiece.type+defendPiece.value} = NS`
            // appendHistory(textHistory, playerColor)
            socket.emit('append-history', textHistory,playerColor)
        }

    }else{
        if(target.classList.contains('add')){
            console.log(attackPiece.type,attackPiece.value ,' + ', defendPiece.type,defendPiece.value,'=','No score\n\n----------------------------')
            const textHistory = `${attackPiece.type+attackPiece.value} + ${defendPiece.type+defendPiece.value} = NS`
            // appendHistory(textHistory, playerColor)
            socket.emit('append-history', textHistory,playerColor)
        }else if(target.classList.contains('subtract')){
            console.log(attackPiece.type,attackPiece.value ,' - ', defendPiece.type,defendPiece.value,'=','No score\n\n----------------------------')
            const textHistory = `${attackPiece.type+attackPiece.value} - ${defendPiece.type+defendPiece.value} = NS`
            // appendHistory(textHistory, playerColor)
            socket.emit('append-history', textHistory,playerColor)
        }else if(target.classList.contains('multiply')){
            console.log(attackPiece.type,attackPiece.value ,' * ', defendPiece.type,defendPiece.value ,'= No score\n\n----------------------------')
            const textHistory = `${attackPiece.type+attackPiece.value} * ${defendPiece.type+defendPiece.value} = NS`
            // appendHistory(textHistory, playerColor)
            socket.emit('append-history', textHistory, playerColor)
        }else if(target.classList.contains('divide')){
            console.log(attackPiece.type,attackPiece.value ,' / ', defendPiece.type,defendPiece.value ,'= No score\n\n----------------------------')
            const textHistory = `${attackPiece.type+attackPiece.value} / ${defendPiece.type+defendPiece.value} = NS`
            // appendHistory(textHistory, playerColor)
            socket.emit('append-history', textHistory, playerColor)
        }
    }
}



function getPieceValue(target, pieceToUpdate){
    elementId = target.getAttribute('id')

    if(ifElementIdInBlue(elementId)){
        switch(elementId){
            case 'bkwh3':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 3
                break;
            
            case 'bp6':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 6
                break;

            case 'bkwh9':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 9
                break;
            
            case 'bp12':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 12
                break;      
                
            case 'bp8':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 8
                break;

            case 'bkwh11':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 11
                break;

            case 'bp4':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 4
                break;

            case 'bkwh1':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 1
                break;

            case 'bkwh5':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 5
                break;

            case 'bp2':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 2
                break;

            case 'bkwh7':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 7
                break;

            case 'bp10':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 10
                break;
        }   

    }else{
        switch(elementId){
            case 'rkwh3':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 3
                break;
            
            case 'rp6':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 6
                break;

            case 'rkwh9':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 9
                break;
            
            case 'rp12':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 12
                break;      
                
            case 'rp8':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 8
                break;

            case 'rkwh11':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 11
                break;

            case 'rp4':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 4
                break;

            case 'rkwh1':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 1
                break;

            case 'rkwh5':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 5
                break;

            case 'rp2':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 2
                break;

            case 'rkwh7':
                pieceToUpdate.type = 'kwh'
                pieceToUpdate.value = 7
                break;

            case 'rp10':
                pieceToUpdate.type = 'P'
                pieceToUpdate.value = 10
                break;
        }   
    }
}

function ifSamePieceType(){
    if(attackPiece.type === defendPiece.type){
        return true
    }
}


function ifElementIdInBlue(id){
    const isit = ['bkwh3', 'bp6', 'bkwh9', 'bp12', 'bp8', 'bkwh11', 'bp4', 'bkwh1', 'bkwh5', 'bp2', 'bkwh7', 'bp10'].includes(id)
    // console.log(isit)
    return isit
}


function appendHistory(history, colorTurn){
    // history = 'Div in the move history'
    const newDiv = document.createElement('div');
    const moveHistoryContent = document.getElementById('move-history-content');
    newDiv.textContent = history;
    moveHistoryContent.appendChild(newDiv);
    moveHistoryContent.scrollTop = moveHistoryContent.scrollHeight;
    newDiv.style.width = '100%';
    if(colorTurn === 'red'){
        newDiv.style.backgroundColor = '#e19898'; // Use a valid color code (e.g., '#e19898')
    }else{
        newDiv.style.backgroundColor = '#929ad7'; // Use a valid color code (e.g., '#e19898')
    }
}

function getRowCol(target){

    const squareId = target.getAttribute('square-id')
    let row, col
    
    if(playerColor === 'red'){
        row = Math.floor(squareId/width)
        col = Math.abs((squareId - (row*width)) - (width-1))
    }else{
        row = Math.floor((64-squareId)/width)
        col = Math.abs(squareId%width)
    }

    return [col, row]
}

