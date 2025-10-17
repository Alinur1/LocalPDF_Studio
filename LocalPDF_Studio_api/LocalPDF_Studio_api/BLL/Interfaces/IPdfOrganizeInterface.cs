using LocalPDF_Studio_api.DAL.Models.OrganizePdfModel;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IPdfOrganizeInterface
    {
        Task<byte[]> OrganizePdfAsync(string filePath, OrganizeOptions options);
    }
}
