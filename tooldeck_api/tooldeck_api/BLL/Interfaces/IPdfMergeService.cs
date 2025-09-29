namespace tooldeck_api.BLL.Interfaces
{
    public interface IPdfMergeService
    {
        Task<byte[]> MergeFilesAsync(IEnumerable<string> inputPaths);
    }
}
