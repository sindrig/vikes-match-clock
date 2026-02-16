import { firebaseAuth } from "../firebaseAuth";
import { useLocalState } from "../contexts/LocalStateContext";

const LoginPage = () => {
  const { listenPrefix, setListenPrefix, auth, available } = useLocalState();

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
