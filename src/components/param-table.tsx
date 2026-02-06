type Param = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
};

export function ParamTable({
  params,
  title,
}: {
  params: Param[];
  title?: string;
}) {
  if (params.length === 0) return null;

  return (
    <div>
      {title && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      )}
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Parameter
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Type
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.name} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <code className="text-xs font-mono font-medium">{p.name}</code>
                  {p.required && (
                    <span className="ml-1 text-[10px] text-destructive">*</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <code className="text-xs font-mono text-muted-foreground">
                    {p.type}
                  </code>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {p.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
