import { AfterViewInit, Component, ElementRef, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { WebSocketService } from '../_services/web-socket.service';
import { Http, RequestOptions, Headers, Response } from '@angular/http';
import { AuthService } from '../../_services/auth.service';
import { defaultPP, User } from '../_models/user';
import { defaultPP as defaultConvPic, Conversation } from '../_models/conversation';
import { ConversationService } from '../_services/conversation.service';
import { Subscription } from 'rxjs/Subscription';
import { UserSearchService } from '../_services/user-search.service';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { Observable } from 'rxjs/Observable';
import { TypeaheadMatch } from 'ngx-bootstrap';
import { fadeInOutAnimation } from '../../_animations/fade-in-out.animation';
import { Router } from '@angular/router';
import { ToastService } from '../_services/toast.service';

import * as $ from 'jquery';

@Component({
  selector   : 'app-conversations-panel',
  templateUrl: './conversations-panel.component.html',
  providers  : [UserSearchService],
  styleUrls  : ['./conversations-panel.component.less'],
  animations : [fadeInOutAnimation]
})
export class ConversationsPanelComponent implements OnInit, AfterViewInit {
  @ViewChild('conversationContainer') private scrollContainer: ElementRef;

  @ViewChild('modalTemplate') private newConvModal: TemplateRef<any>;

  private base_url = 'http://localhost:3000';
          conversations: Array<Conversation>;
          conversationsSubscription: Subscription;
          user: User;
          convSearch = "";

  //noinspection JSUnusedLocalSymbols
  constructor(
    private router: Router,
    private http: Http,
    private auth: AuthService,
    private ws: WebSocketService,
    private convService: ConversationService,
    private searchService: UserSearchService,
    private modalService: BsModalService,
    private toastService: ToastService
  ) {
    this.conversationsSubscription = convService.conversations$.subscribe(
      convs => this.conversations = convs
    );
    this.ws.conversation$.subscribe(
      conv => {
       this.onNewConversation(conv);
      });
    this.ws.conversationOK$.subscribe(
      conv => {
        this.onNewConversation(conv, true);
      });
  }

  private setHttpOptions(headers?: Headers) {
    if (!headers) headers = new Headers({
      'content-type': 'application/json',
      'x-access-token': this.auth.getToken()
    });
    return new RequestOptions({ headers: headers, withCredentials: true });
  }

  ngOnInit() {
    console.log("ConversationsComponent INIT");
    this.convService.scrollContainer = this.scrollContainer;
    this.user = this.auth.getUser();

    this.convService.getConversations().subscribe((convs: Array<Conversation>) => {
      console.log('All conversations :');
      console.log(convs);
      this.convService.setConversations(convs);
    });
  }

  ngAfterViewInit() {
    this.convService.newConversation$.subscribe(
      () => this.openNewConversationModal(this.newConvModal)
    );
  }

  static parseRes(res) {
    return JSON.parse(res['_body']);
  }

  /* ---------------------------------------------------------------------------- */
  /* -------------------------- NEW CONVERSATION MODAL -------------------------- */
  /* ---------------------------------------------------------------------------- */

  // TODO: add global modals service which force them to close on logout

  public modalRef: BsModalRef;

  public asyncSelected: string;
  public typeaheadLoading: boolean;
  public typeaheadNoResults: boolean;
  public dataSource: Observable<any>;
  public newConversation: Conversation = new Conversation();

  openNewConversationModal(template: TemplateRef<any>) {
    this.modalRef = this.modalService.show(template, {
      'class': 'custom-modal new-conv-modal'
    });

    // Configure users search
    this.dataSource = Observable
      .create((observer: any) => {
        // Runs on every search
        observer.next(this.asyncSelected);
      })
      .mergeMap((token: string) => this.getUsersAsObservable(token));
  }

  public getUsersAsObservable(token: string): Observable<any> {
    return this.searchService.search(token, this.newConversation.members.map(user => user.id))
      .map((res: Response) => {
        let data: any          = ConversationsPanelComponent.parseRes(res)['data'],
            users: Array<User> = data.users;

        users
          .map(user => {
            user.label = user.login === null ? user.email : `${user.login} (${user.email})`;
            if (user.profile_picture === null)
              user.profile_picture = defaultPP;
          });
        return users;
      });
  }

  public changeTypeaheadLoading(e: boolean): void {
    this.typeaheadLoading = e;
  }

  public changeTypeaheadNoResults(e: boolean): void {
    this.typeaheadNoResults = e;
  }

  public typeaheadOnSelect(e: TypeaheadMatch): void {
    let selectedUser: User = e.item;
    this.addMemberToConversation(selectedUser);
    this.asyncSelected = ''; // Clear the input
  }

  addMemberToConversation(user: User) {
    this.newConversation.members.push(user);
  }

  removeMemberFromConversation(user: User) {
    this.newConversation.members.splice(
      this.newConversation.members.indexOf(user), 1
    );
  }

  createNewConv(e: any) {

    e.preventDefault();

    // If no members are added exit
    if (this.newConversation.members.length === 0)
      return;

    let newConv = $.extend(true, {}, this.newConversation);
    newConv.members.push(this.user); // Add the current user

    console.log('conversation to create:');
    console.log(newConv);
    this.ws.createConversation(newConv);
  }

  /**
   *
   * @param conv
   * @param {boolean} mine True if callback of my own post
   */
  private onNewConversation(conv, mine: boolean = false) {
    console.log("onNewConversation");
    console.log(conv);

    let newConv     = new Conversation();
    newConv.id      = conv.id;
    newConv.title   = conv.title;
    newConv.root    = conv.root;
    newConv.members = conv.members;
    newConv.picture = defaultConvPic;

    this.convService.addConversation(newConv, mine);

    this.user.conversations.push(newConv.id);
    this.auth.setUser(this.user);

    // Update the remote user info (server session)
    this.http.put(`${this.base_url}/api/set-user`, { user: this.auth.getUser() }, this.setHttpOptions())
      .subscribe(res => {
        let parsedRes = ConversationsPanelComponent.parseRes(res);
        let success   = parsedRes.success;
        if (!success) // TODO: directly use Node/Express errors encapsulation (status, statusText)
          console.error(parsedRes.message); // TODO: add a error service which logs errors & logout

        if (mine) {
          // Reset the modal's new conversation object
          this.newConversation = new Conversation();

          this.modalRef.hide(); // Close the modal

          this.router.navigate(['/conversation', newConv.id]);
          this.toastService.showSuccess('Conversation créée !');
        }

        // TODO: find out how to notify for a new conversation created by others
      });
  }

}
