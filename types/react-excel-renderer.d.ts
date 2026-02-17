declare module "react-excel-renderer" {
    export type ExcelRendererColumn = {
        name?: string
        key?: string
    }

    export type ExcelRendererResponse = {
        cols?: ExcelRendererColumn[]
        rows?: unknown[][]
    }

    export function ExcelRenderer(
        file: File,
        callback: (err: unknown, resp: ExcelRendererResponse) => void,
    ): void
}
