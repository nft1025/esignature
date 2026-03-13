'use client';

import React, { useState, useRef } from 'react';
import { SignatureUploader } from '@/components/SignatureUploader';
import { DocumentCard } from '@/components/DocumentCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FilePlus, PenTool, LayoutDashboard, ShieldCheck, Files, FileText } from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';

export default function QuickSign() {
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [documents, setDocuments] = useState<File[]>([]);
  const [previewFile, setPreviewFile] = useState<{file: File, url: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setDocuments(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const openPreview = (file: File) => {
    const url = URL.createObjectURL(file);
    setPreviewFile({ file, url });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <PenTool className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-primary tracking-tight">QuickSign</h1>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <nav className="flex items-center gap-4">
              <Button variant="ghost" className="gap-2"><LayoutDashboard className="w-4 h-4" /> Dashboard</Button>
              <Button variant="ghost" className="gap-2"><ShieldCheck className="w-4 h-4" /> Security</Button>
            </nav>
            <div className="w-px h-6 bg-border" />
            <Button variant="outline" className="rounded-full">Help Center</Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Signature Setup */}
          <div className="lg:col-span-4 space-y-6">
            <SignatureUploader onSignatureUpload={setSignatureImage} />
            
            <Card className="bg-gradient-to-br from-primary to-primary/80 text-white border-none shadow-xl">
              <CardContent className="p-6">
                <h3 className="font-bold text-lg mb-2">Smart AI Detection</h3>
                <p className="text-white/80 text-sm leading-relaxed mb-4">
                  QuickSign automatically scans your documents for keywords like 
                  <span className="font-mono bg-white/20 px-1 mx-1 rounded text-white font-semibold">APPROVED BY</span> 
                  to suggest the best signing spot.
                </p>
                <div className="flex items-center gap-2 text-white/60 text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  Processed securely in your browser.
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Document Management */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Files className="w-5 h-5 text-primary" />
                Documents
              </h2>
              <Button 
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90"
              >
                <FilePlus className="w-4 h-4 mr-2" />
                Upload PDFs
              </Button>
              <input 
                type="file" 
                multiple 
                accept="application/pdf" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileChange}
              />
            </div>

            {documents.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border/60 rounded-3xl py-20 bg-white/30">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Files className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground">No documents uploaded yet</h3>
                <p className="text-muted-foreground text-sm max-w-xs text-center mt-2">
                  Upload multiple PDF files to begin batch signing with AI-assisted placement.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 overflow-y-auto max-h-[70vh] pr-2 custom-scrollbar">
                {documents.map((file, index) => (
                  <DocumentCard 
                    key={`${file.name}-${index}`} 
                    file={file} 
                    signatureImage={signatureImage}
                    onRemove={() => removeDocument(index)}
                    onPreview={() => openPreview(file)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* PDF Preview Modal */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {previewFile?.file.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 bg-muted relative">
            {previewFile && (
              <iframe 
                src={`${previewFile.url}#toolbar=0`} 
                className="w-full h-full border-none"
                title="PDF Preview"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}
