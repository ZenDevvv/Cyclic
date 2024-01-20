const express = require('express');
const app = express();
const path = require('path')

const port = process.env.PORT || 5500;
const http = require('http').Server(app)

//attach http server to the socket.io
const io = require('socket.io')(http, {
    cors: {
        origin: "https://dashboard.render.com",    //Replace with your client's origin  ex. "http://your-client-origin"
        methods: ['GET', 'POST'],
    },
});

app.use(express.static(path.join(__dirname, 'src')));
//const cors = require('cors');   // Import the cors middleware
//app.use(cors());        // Enable CORS for all routes

//route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/index.html'))
})

http.listen(port, () => {
    console.log(`App listening on port ${port}`)
})



const existingRooms = new Map();
const reverse = 63


function findRoomBySocketId(socketId) {
    let targetRoom = null;
    existingRooms.forEach((roomData, roomId) => {
        if ((roomData.player1 && roomData.player1.socketId === socketId) || (roomData.player2 && roomData.player2.socketId === socketId)) {
            targetRoom = { roomData, roomId };
        }
    });
    return targetRoom;
}

//create a new connection
io.on('connection', socket => {

    socket.on('create-room', (playerName, roomId, cb) => {
        if (!existingRooms.has(roomId)  && roomId !== '' && playerName !== '') {
            const roomData = {
                player1: { name: playerName, socketId: socket.id },
                player2: null, // Initialize player2 as null
            };
            existingRooms.set(roomId, roomData);
            socket.join(roomId);
            socket.emit('room-created', roomId);
        } else {
            cb('Room already exist!');
        }

        console.log(existingRooms)
    })
 

    socket.on('join-room', (playerName, roomId, cb) => {
        const roomData = existingRooms.get(roomId);
        console.log(roomData)
        if(roomData) {
            if(!roomData.player2){
                roomData.player2 = { name: playerName, socketId: socket.id };
                socket.join(roomId);
                socket.to(roomId).emit('show-player2', playerName, roomId);
                
            }else{
                cb('Room already full!')
            }
        }else{
            cb('Room does not exist!')
        }
        console.log(existingRooms)
    });

    socket.on('player1-joined', (playerName ,roomId) => {
        socket.to(roomId).emit('show-player1', playerName ,roomId)
    })
 
    socket.on('move-piece', pieceId => {
        pieceId.targetId = reverse-pieceId.targetId // reverse players move
        
        const targetRoom = findRoomBySocketId(socket.id);
        if (targetRoom) {
            const { roomData, roomId } = targetRoom;
            socket.to(roomId).emit('moved-piece-id', pieceId);
        }
    })

    socket.on('remove-piece', removedPieceId => {
        const targetRoom = findRoomBySocketId(socket.id);
        if (targetRoom) {
            const { roomData, roomId } = targetRoom;
            socket.to(roomId).emit('remove-piece', removedPieceId);
        }
    })

    socket.on('change-player', () => {
        const targetRoom = findRoomBySocketId(socket.id);
        if (targetRoom) {
            const { roomData, roomId } = targetRoom;
            socket.to(roomId).emit('change-player-opponent'); // emit the reversed move to the opponent,
        }
    })
    
    socket.on('make-king', piece => {
        const targetRoom = findRoomBySocketId(socket.id);
        if (targetRoom) {
            const { roomData, roomId } = targetRoom;
            socket.to(roomId).emit('make-king', piece); // emit the reversed move to the opponent,
           
        }
    })
 
    socket.on('update-score', (score, playerColor) => {
        const targetRoom = findRoomBySocketId(socket.id);
        if (targetRoom) {
            const { roomData, roomId } = targetRoom;
            io.to(roomId).emit('update-score', score, playerColor); // emit the reversed move to the opponent,           
        }
    })

    socket.on('append-history', (textHistory, playerColor) => {
        const targetRoom = findRoomBySocketId(socket.id);
        if (targetRoom) {
            const { roomData, roomId } = targetRoom;
            io.to(roomId).emit('append-history', textHistory, playerColor); 
        }
    })

    socket.on('win-condition', winColor => {
        const targetRoom = findRoomBySocketId(socket.id);
        if (targetRoom) {
            const { roomData, roomId } = targetRoom;
            io.to(roomId).emit('win-condition', winColor);          
        }
    })

   

    socket.on('disconnect', () => {
        console.log('A user disconnected');  
        existingRooms.forEach((roomData, roomId) => {
            console.log('roomdata',roomData, 'id',roomId)
            if (roomData.player1 && roomData.player1.socketId === socket.id) {
                socket.to(roomId).emit('opponent-disconnected');
                existingRooms.delete(roomId);
            } else if (roomData.player2 && roomData.player2.socketId === socket.id) {
                socket.to(roomId).emit('opponent-disconnected');
                existingRooms.delete(roomId);
            }
        });
        console.log(existingRooms)

    });
})
