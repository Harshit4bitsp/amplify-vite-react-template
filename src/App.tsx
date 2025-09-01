import { useEffect, useState } from "react";
import { useAuthenticator } from '@aws-amplify/ui-react';
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import { LivenessQuickStartReact } from "./components/FaceLiveness";

const client = generateClient<Schema>();

function App() {
  // const { signOut } = useAuthenticator();
  // const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);

  // useEffect(() => {
  //   client.models.Todo.observeQuery().subscribe({
  //     next: (data) => setTodos([...data.items]),
  //   });
  // }, []);

  // function createTodo() {
  //   client.models.Todo.create({ content: window.prompt("Todo content") });
  // }

    
  // function deleteTodo(id: string) {
  //   client.models.Todo.delete({ id })
  // }

  return (
    <main>
      
      {/* Face Liveness Detection Component */}
      <LivenessQuickStartReact />
      
      
    </main>
  );
}

export default App;
