import "../styles/globals.css";
import { AppProps } from "next/app";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div style={{ margin: "20px" }}>
      <h2>EconSight UI</h2>
      <Component {...pageProps} />
    </div>
  );
}
