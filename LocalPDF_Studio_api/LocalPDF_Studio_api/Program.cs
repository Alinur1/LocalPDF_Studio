/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @license     AGPL 3.0 (GNU Affero General Public License version 3)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/


using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.BLL.Services;
using LocalPDF_Studio_api.BLL.Utils;
using PdfSharp.Fonts;
using System.Net;
using System.Net.Sockets;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddScoped<IPdfMergeInterface, PdfMergeService>();
builder.Services.AddScoped<IPdfSplitInterface, PdfSplitService>();
builder.Services.AddScoped<IPdfRemoveInterface, PdfRemoveService>();
builder.Services.AddScoped<IPdfOrganizeInterface, PdfOrganizeService>();
builder.Services.AddScoped<IPdfCompressInterface, PdfCompressService>();
builder.Services.AddScoped<IPdfToImageInterface, PdfToImageService>();
builder.Services.AddScoped<IAddPageNumbersInterface, AddPageNumbersService>();
builder.Services.AddScoped<IWatermarkInterface, WatermarkService>();
builder.Services.AddScoped<ICropPdfInterface, CropPdfService>();
builder.Services.AddScoped<ILockUnlockPdfInterface, LockUnlockPdfService>();
builder.Services.AddScoped<IPdfExtractImagesInterface, PdfExtractImagesService>();
builder.Services.AddScoped<IGhostscriptInterface, GhostscriptService>();
builder.Services.AddScoped<IImageToPdfInterface, ImageToPdfService>();
builder.Services.AddScoped<IRedactInterface, RedactService>();
builder.Services.AddScoped<IPdfGrayscaleInterface, PdfGrayscaleService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowElectronApp", policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

// Get dynamic port
int port = GetAvailablePort();

// Configure Kestrel to use dynamic port
builder.WebHost.ConfigureKestrel(options =>
{
    options.Listen(IPAddress.Loopback, port);
});

// Font resolver for PdfSharp
var fontsPath = Path.GetFullPath(
    Path.Combine(AppContext.BaseDirectory, "..", "..", "assets", "fonts"));
GlobalFontSettings.FontResolver = new LocalFontResolver(fontsPath);

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowElectronApp");
app.UseAuthorization();
app.MapControllers();

// Output the port to stdout so Electron can read it
Console.WriteLine($"API_PORT:{port}");

app.Run();

// Helper method to find an available port
static int GetAvailablePort()
{
    using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
    socket.Bind(new IPEndPoint(IPAddress.Loopback, 0));
    socket.Listen(1);
    var port = ((IPEndPoint)socket.LocalEndPoint!).Port;
    socket.Close();
    return port;
}
