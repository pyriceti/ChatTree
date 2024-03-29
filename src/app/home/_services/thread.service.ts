import { ElementRef, Injectable } from '@angular/core';
import { Http, RequestOptions, Response, Headers } from '@angular/http';
import { AuthService } from '../../_services/auth.service';
import { Observable } from 'rxjs/Observable';
import { Thread } from '../_models/thread';

import 'rxjs/add/observable/throw';
import { Message } from '../_models/message';
import { Subject } from 'rxjs/Subject';
import { ConversationService } from './conversation.service';

@Injectable()
export class ThreadService {

  private base_url       = 'http://localhost:3000';
  private get_thread_url = 'api/get-thread';

  activeThread: Thread;
  scrollContainer: ElementRef;

  private setHttpOptions(headers?: Headers) {
    if (!headers) headers = new Headers({
      'content-type'  : 'application/json',
      'x-access-token': this.auth.getToken()
    });
    return new RequestOptions({ headers: headers, withCredentials: true });
  }

  constructor(
    private http: Http,
    private auth: AuthService,
    private convService: ConversationService
  ) {}

  addMessagesToActiveThread(msgs: Array<Message> | Message) {
    let timeout  = 500,
        animate = true;

    if (Array.isArray(msgs))
      this.activeThread.messages.push(...msgs);
    else {
      if (this.activeThread.messages.length !== 0 &&
        this.activeThread.messages[this.activeThread.messages.length - 1].id >= msgs.id)
        return;
      this.activeThread.messages.push(msgs);
      timeout = 0;
      if (msgs.author !== this.auth.getUser().id) {
        let scrollElem = this.scrollContainer.nativeElement;
        // If we received a message, we animate if the container is already at bottom
        animate        = scrollElem.scrollHeight - (scrollElem.scrollTop + $(scrollElem).innerHeight()) <= 200;
        if (!animate) {
          // TODO: find a way to visually notify the client (e.g. he's reading above)
        }
      }
    }

    if (animate)
      setTimeout(() => {
        $(this.scrollContainer.nativeElement).animate({
            scrollTop: $(this.scrollContainer.nativeElement).prop("scrollHeight")
          },
          300
        );
      }, timeout);

  }

  getThreadMessages(id: number, convId: number): Observable<Array<Message>> {
    return this.http.get(`${this.base_url}/${this.get_thread_url}/${convId}/${id}`, this.setHttpOptions())
      .map(ThreadService.extractData)
      .map(res => res.messages)
      .do(() => this.activeThread = this.convService.activeConversation.threads.find(thread => thread.id === id))
      .catch(ThreadService.handleError);
  }

  private static extractData(res: Response) {
    let body: any = res.json();
    return body.data || {};
  }

  private static handleError(error: Response | any) {
    // In a real world app, you might use a remote logging infrastructure
    let errMsg: string;
    if (error instanceof Response) {
      const body: any = error.json() || '';
      const err       = body.error || JSON.stringify(body);
      errMsg          = `${error.status} - ${error.statusText || ''} ${err}`;
    } else {
      errMsg = error.message ? error.message : error.toString();
    }
    console.error(errMsg);
    return Observable.throw(errMsg);
  }

}
