import { MethodBadge } from "@/components/method-badge";
import { ParamTable } from "@/components/param-table";
import { CodeBlock } from "@/components/code-block";

type Param = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
};

type EndpointProps = {
  method: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  path: string;
  description: string;
  auth?: string;
  params?: Param[];
  bodyParams?: Param[];
  queryParams?: Param[];
  curlExample?: string;
  responseExample?: string;
};

export function EndpointBlock({
  method,
  path,
  description,
  auth,
  params,
  bodyParams,
  queryParams,
  curlExample,
  responseExample,
}: EndpointProps) {
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-muted/30">
        <MethodBadge method={method} />
        <code className="text-sm font-mono font-medium">{path}</code>
      </div>

      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">{description}</p>

        {auth && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Auth:
            </span>
            <span className="text-xs text-foreground">{auth}</span>
          </div>
        )}

        {queryParams && queryParams.length > 0 && (
          <ParamTable params={queryParams} title="Query Parameters" />
        )}

        {params && params.length > 0 && (
          <ParamTable params={params} title="URL Parameters" />
        )}

        {bodyParams && bodyParams.length > 0 && (
          <ParamTable params={bodyParams} title="Request Body" />
        )}

        {curlExample && <CodeBlock code={curlExample} title="Example Request" />}

        {responseExample && (
          <CodeBlock code={responseExample} title="Example Response" />
        )}
      </div>
    </div>
  );
}
