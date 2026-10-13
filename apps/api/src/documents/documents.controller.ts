import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  StreamableFile,
} from '@nestjs/common';
import type { DocumentListResponse } from '@forte/chat-contract';
import { documentUrl } from './document-url.js';
import { DocumentsService } from './documents.service.js';

/** Letters, digits, dot, dash and underscore; what a document number can look like. */
const DOCUMENT_NUMBER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

@Controller('documents')
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  /**
   * The current revision of every data sheet of a visible product, each with the link to
   * its PDF. `no-store` so a list naming a superseded revision is not kept.
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(): Promise<DocumentListResponse> {
    const documents = await this.documents.listCurrent();
    return {
      documents: documents.map((document) => ({
        ...document,
        url: documentUrl(document.documentNumber),
      })),
    };
  }

  /**
   * The PDF of the CURRENT revision of a document. There is deliberately no revision in
   * the URL: a link always serves whatever is current now. `no-store` keeps browsers and
   * proxies from holding on to a PDF after a newer revision has replaced it.
   *
   * An unknown number and a hidden product's document both answer the same 404.
   */
  @Get(':documentNumber/file')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async file(@Param('documentNumber') documentNumber: string): Promise<StreamableFile> {
    if (!DOCUMENT_NUMBER.test(documentNumber)) {
      throw new BadRequestException('Invalid document number');
    }
    const file = await this.documents.getCurrentFile(documentNumber);
    if (file === null) throw new NotFoundException();

    return new StreamableFile(file.content, {
      type: 'application/pdf',
      // The stored name is reduced to safe characters before it goes into a header.
      disposition: `inline; filename="${file.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      length: file.content.byteLength,
    });
  }
}
