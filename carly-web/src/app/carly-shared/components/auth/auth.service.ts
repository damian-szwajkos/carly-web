import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {tap} from 'rxjs/operators';
import {Injectable} from '@angular/core';
import {Router} from '@angular/router';
import {BehaviorSubject, Observable, throwError} from 'rxjs';
import jwt_decode from 'jwt-decode';
import {AuthModel} from '../../model/auth-model';
import {UserContext} from '../../model/user-context.model';
import {Registration} from '../../model/registration.model';
import {MessageResponse} from '../../model/message-response.model';
import {JwtTokenResponse} from '../../model/jwt-token-response.model';
import {MessageService} from '../../services/message.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private static USER_CONTEXT = 'carly-app.userContext';
  private static AUTH_API = 'api/auth';
  private static ONE_MINUTE_MILLISECONDS = 60000;
  private refreshTokenTimer: any;
  private tokenExpirationDuration: any;
  userContext = new BehaviorSubject<UserContext>(null);

  constructor(
    private http: HttpClient,
    private router: Router,
    private messageService: MessageService
  ) {
  }


  signUpCustomer(model: Registration.Model) {
    return this.http.post<MessageResponse>(`${AuthService.AUTH_API}/signup-customer`, model);
  }

  signUpCompany(model: Registration.Model) {
    console.log(model);
    return this.http.post<MessageResponse>(`${AuthService.AUTH_API}/signup-company`, model);
  }

  login(model: AuthModel) {
    return this.http.post<JwtTokenResponse>(`${AuthService.AUTH_API}/signin`, model)
      .pipe(tap(resData => {
        this.handleAuthentication(resData.jwtToken);
      }));
  }

  autoLogin() {
    console.log(666, 'AUTOLOGIN');
    const userData: UserContext = JSON.parse(localStorage.getItem(AuthService.USER_CONTEXT));
    if (!userData) {
      this.router.navigate(['/auth']);
      return;
    }

    this.userContext.next(userData);
    // refresh token if expired
  }

  logout() {
    this.http.get<MessageResponse>(`${AuthService.AUTH_API}/logout`).subscribe(resData => {
      this.messageService.showMessage(resData.message);
      this.userContext.next(null);
      this.router.navigate(['/auth']);
      localStorage.removeItem(AuthService.USER_CONTEXT);
      if (this.refreshTokenTimer) {
        clearTimeout(this.refreshTokenTimer);
      }
      this.refreshTokenTimer = null;
    }, error => {
      console.log(error);
    });
  }

  autoLogout(expirationDuration: number) {
    this.refreshTokenTimer = setTimeout(() => {
      this.logout();
    }, expirationDuration);
  }

  // todo: this method should be in user management
  getUserContext(): Observable<UserContext> {
    return this.userContext;
  }

  private handleAuthentication(token: string) {
    const decodedToken: string = JSON.stringify(jwt_decode(token));
    const userContext: UserContext = {
      ...JSON.parse(decodedToken)
    };
    userContext.token = token;
    console.log(new Date(+userContext.exp * 1000));
    this.tokenExpirationDuration = new Date(+userContext.exp * 1000).getTime() - new Date().getTime();
    // Refresh token one minute before token will expire
    this.autoRefreshToken(this.tokenExpirationDuration - AuthService.ONE_MINUTE_MILLISECONDS);
    this.userContext.next(userContext);
    localStorage.setItem(AuthService.USER_CONTEXT, JSON.stringify(userContext));
  }

  private autoRefreshToken(refreshDuration: number) {
    this.refreshTokenTimer = setTimeout(() => {
      this.refreshToken();
    }, refreshDuration);
  }

  private refreshToken() {
    console.log(100, 'REFRESH TOKEN');
    this.http.get<JwtTokenResponse>(`${AuthService.AUTH_API}/refresh-token`)
      .subscribe(resData => {
        this.handleAuthentication(resData.jwtToken);
      }, error => {
        console.log(error);
        this.logout();
      });
  }

  private handleError(errorRes: HttpErrorResponse) {
    let errorMessage = 'An unknown error occurred!';
    if (!errorRes.error || !errorRes.error.error) {
      return throwError(errorMessage);
    }
    switch (errorRes.error.error.message) {
      /* Sign up exceptions */
      case 'EMAIL_EXISTS':
        errorMessage = 'The email address is already in use by another account.';
        break;
      case 'OPERATION_NOT_ALLOWED':
        errorMessage = 'Password sign-in is disabled for this project.';
        break;
      case 'TOO_MANY_ATTEMPTS_TRY_LATER':
        errorMessage = 'We have blocked all requests from this device due to unusual activity. Try again later.';
        break;

      /* Login exceptions */
      case 'EMAIL_NOT_FOUND':
        errorMessage = 'There is no user record corresponding to this identifier. The user may have been deleted.';
        break;
      case 'INVALID_PASSWORD':
        errorMessage = 'The password is invalid or the user does not have a password.';
        break;
      case 'USER_DISABLED':
        errorMessage = 'The user account has been disabled by an administrator.';
        break;
    }
    return throwError(errorMessage);
  }

}
