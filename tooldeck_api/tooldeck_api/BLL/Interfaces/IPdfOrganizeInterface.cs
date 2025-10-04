using tooldeck_api.DAL.Models.OrganizePdfModel;

namespace tooldeck_api.BLL.Interfaces
{
    public interface IPdfOrganizeInterface
    {
        Task<byte[]> OrganizePdfAsync(string filePath, OrganizeOptions options);
    }
}
