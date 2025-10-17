namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IPdfMergeInterface
    {
        Task<byte[]> MergeFilesAsync(IEnumerable<string> inputPaths);
    }
}
