'use client';

import React, { useState, useRef } from 'react';
import { SignatureUploader } from '@/components/SignatureUploader';
import { DocumentCard } from '@/components/DocumentCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FilePlus, PenTool, LayoutDashboard, ShieldCheck, Files, FileText, User, Search, CheckCircle2, X } from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export default function QuickSign() {
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [signatoryName, setSignatoryName] = useState<string>('');
  const [confirmedSignatory, setConfirmedSignatory] = useState<string>('');
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

  const handleConfirmSignatory = () => {
    setConfirmedSignatory(signatoryName.trim());
  };

  const clearConfirmedSignatory = () => {
    setConfirmedSignatory('');
    setSignatoryName('');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
          
          {/* Left Column: Signature & Settings */}
          <div className="lg:col-span-4 space-y-6">
            <SignatureUploader onSignatureUpload={setSignatureImage} />
            
            <Card className="bg-white/50 backdrop-blur-sm relative overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Priority Signatory
                </CardTitle>
                <CardDescription>
                  Enter a name to prioritize for signing.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Label htmlFor="signatory-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Signatory Name (Optional)
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input 
                        id="signatory-name"
                        placeholder="e.g. Neil Teresa" 
                        value={signatoryName}
                        onChange={(e) => setSignatoryName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleConfirmSignatory()}
                        className="pl-9"
                        disabled={!!confirmedSignatory}
                      />
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    </div>
                    {confirmedSignatory ? (
                      <Button variant="outline" size="icon" onClick={clearConfirmedSignatory} className="shrink-0 border-destructive/20 text-destructive hover:bg-destructive/10">
                        <X className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button onClick={handleConfirmSignatory} size="sm" className="shrink-0">Set</Button>
                    )}
                  </div>
                  
                  {confirmedSignatory && (
                    <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-100 rounded-lg text-green-700 text-xs font-medium animate-in fade-in slide-in-from-top-1">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Priority set for: {confirmedSignatory}
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {confirmedSignatory 
                      ? "AI is now searching for this exact signatory. Matches include variations with initials and different casing." 
                      : "Leave blank or type a name and press Enter to automatically detect and sign all signatory areas found."}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-primary to-primary/80 text-white border-none shadow-xl">
              <CardContent className="p-6">
                <h3 className="font-bold text-lg mb-2">Smart Batch Signing</h3>
                <p className="text-white/80 text-sm leading-relaxed mb-4">
                  Upload multiple PDFs and QuickSign will use AI to find the correct signing spots instantly.
                </p>
                <div className="flex items-center gap-2 text-white/60 text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  Secure, private, and local processing.
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
              <div className="flex items-center gap-2">
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90"
                >
                  <FilePlus className="w-4 h-4 mr-2" />
                  Upload
                </Button>
              </div>
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
                  Upload PDF files to begin batch signing with AI-assisted placement.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 overflow-y-auto max-h-[70vh] pr-2 custom-scrollbar">
                {documents.map((file, index) => (
                  <DocumentCard 
                    key={`${file.name}-${index}`} 
                    file={file} 
                    signatureImage={signatureImage}
                    prioritySignatory={confirmedSignatory}
                    onRemove={() => removeDocument(index)}
                    onPreview={() => openPreview(file)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between bg-white">
            <h3 className="font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {previewFile?.file.name}
            </h3>
            <Button variant="ghost" size="icon" onClick={() => setPreviewFile(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
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
