import { firebaseAuth } from "../firebaseAuth";
import { useLocalState } from "../contexts/LocalStateContext";

const LoginPage = () => {
  const { sync, setSync, listenPrefix, setListenPrefix, auth, available } =
    useLocalState();

  if (!auth.isLoaded || auth.isEmpty) {
    return null;
  }

  return (
    <div>
      {available.length > 0 && (
        <div>
          Stjórnandi:
          <select
            onChange={({ target: { value } }) => setListenPrefix(value)}
            value={listenPrefix}
          >
            {available.map((a) => (
              <option value={a} key={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}
      <label htmlFor="set-synced">
        <input
          type="checkbox"
          checked={sync}
          onChange={() => setSync(!sync)}
          id="set-synced"
        />
        Fjarstjórn
      </label>
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
