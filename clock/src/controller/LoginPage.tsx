import { useState } from "react";
import { firebaseAuth } from "../firebaseAuth";
import { useLocalState } from "../contexts/LocalStateContext";

const LoginPage = () => {
  const { listenPrefix, setListenPrefix, auth, available } = useLocalState();
  const [selectedScreen, setSelectedScreen] = useState(
    listenPrefix || available[0] || "",
  );

  if (!auth.isLoaded || auth.isEmpty) {
    return null;
  }

  return (
    <div>
      {available.length > 0 && (
        <div>
          Stjórnandi:
          <select
            onChange={({ target: { value } }) => setSelectedScreen(value)}
            value={selectedScreen}
          >
            {available.map((a) => (
              <option value={a} key={a}>
                {a}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setListenPrefix(selectedScreen)}>
            Birta skjá
          </button>
        </div>
      )}
      [<b>{auth.email}</b>][{listenPrefix}]
      <br />
      <button
        type="button"
        onClick={() => {
          void firebaseAuth.logout();
        }}
      >
        Log out...
      </button>
    </div>
  );
};

export default LoginPage;
