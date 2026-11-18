import { png, type Step } from "../api";

const LABEL: Record<string, string> = {
  image: "Input",
  relu: "Encoder 1",
  relu_1: "Encoder 2",
  relu_2: "Encoder 3",
  relu_3: "Encoder 4",
  code: "Code",
  relu_5: "Decoder 1",
  relu_6: "Decoder 2",
  relu_7: "Decoder 3",
  rooms: "Output",
  reconstruction: "Output",
};

function opText({ op, kernel_shape, strides }: Step["ops"][number]) {
  if (op === "Gemm") return "dense";
  const kernel = `${kernel_shape?.[0]}×${kernel_shape?.[1]}, stride ${strides?.[0]}`;
  return op === "Conv" ? `conv ${kernel}` : `transposed ${kernel}`;
}

function shapeText(step: Step) {
  if (step.tensor === "image") return `${step.shape[1]} × ${step.shape[2]} px`;
  if (step.shape.length === 1) return `${step.shape[0]} numbers`;
  return `${step.shape[0]} × ${step.shape[1]} × ${step.shape[2]}`;
}

// Every layer of the network, in order, with what it computed for your plan: read from the ONNX file the server runs
export function Layers({ steps }: { steps: Step[] }) {
  return (
    <ol className="layers">
      {steps.map((step) => (
        <li key={step.tensor} className="layer" data-kind={step.tensor === "code" ? "code" : step.tiles?.length === 4 ? "channels" : "single"}>
          <h4>{LABEL[step.tensor] ?? step.tensor}</h4>
          <p className="layer-meta">
            {step.ops.length > 0 && <span>{step.ops.map(opText).join(" + ")}</span>}
            <span>{shapeText(step)}</span>
            {step.weights > 0 && <span>{step.weights.toLocaleString("en")} weights</span>}
          </p>
          {step.values ? (
            <CodeBars values={step.values} />
          ) : (
            <div className="tiles">
              {step.tiles!.map((tile) => (
                <figure key={tile.channel ?? tile.name}>
                  <img className="pixel" src={png(tile.png)} alt={tile.name ?? `Channel ${tile.channel}`} />
                  <figcaption>{tile.name ?? `ch ${tile.channel}`}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

// The 128 numbers that stand for your plan; the search compares only these
function CodeBars({ values }: { values: number[] }) {
  const peak = Math.max(...values.map(Math.abs)) || 1;
  const H = 96;
  return (
    <figure className="code">
      <svg viewBox={`0 0 ${values.length} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`The 128 numbers of the code, from ${Math.min(...values).toFixed(2)} to ${Math.max(...values).toFixed(2)}`}>
        <line x1={0} x2={values.length} y1={H / 2} y2={H / 2} className="axis" />
        {values.map((v, i) => {
          const h = (Math.abs(v) / peak) * (H / 2 - 2);
          return <rect key={i} x={i + 0.15} width={0.7} y={v >= 0 ? H / 2 - h : H / 2} height={h} />;
        })}
      </svg>
      <figcaption>{Math.min(...values).toFixed(1)} to {Math.max(...values).toFixed(1)}</figcaption>
    </figure>
  );
}
