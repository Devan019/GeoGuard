from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # 1. FIX: Changed from list [] to a dictionary {}
        self.active_connections: dict[str, WebSocket] = {}

    # 2. FIX: Accept client_id and save it as the dictionary key
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        print(f"Client {client_id} connected.")

    # 3. FIX: Disconnect using the client_id
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def broadcast_json(self, message: dict):
        print(f"Broadcasting message to {len(self.active_connections)} clients.")
        print(f"Active clients: {list(self.active_connections.keys())}")
        # Since it's a dict now, we iterate over .values()
        for connection in self.active_connections.values():
            await connection.send_json(message)
    
    async def send_personal_message(self, message: dict, client_id: str):
        print(f"sending personal message to {client_id}")
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_json(message)
        else:
            print(f"Warning: Client {client_id} is not connected.")

manager = ConnectionManager()